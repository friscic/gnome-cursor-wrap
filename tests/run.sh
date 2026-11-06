#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Runs Cursor Wrap integration tests in an isolated, headless GNOME Shell.
#
# Usage: tests/run.sh [TEST.test.js ...]    (default: tests/*.test.js)
#
# Each test file gets its own GNOME Shell with a private session bus, runtime
# directory, and settings, so it never touches the desktop you are logged
# into. Header comments in a test file configure its run:
#   // @monitors 1920x1080 1280x1024    virtual monitors to create
#   // @session x11                     X11 session under Xvfb (GNOME 48/49)
#
# Environment:
#   CW_LOG_DIR   where logs, results, the tested zip and screenshots go
#                (default: a new temporary directory)
#   CW_TIMEOUT   seconds before a single test run is killed (default: 300)

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
UUID=cursor-wrap@friscic.github.io
ZIP=$UUID.shell-extension.zip
SCHEMA=schemas/org.gnome.shell.extensions.cursor-wrap.gschema.xml
LOG_DIR=${CW_LOG_DIR:-$(mktemp -d -t cursor-wrap-tests-XXXXXX)}
TIMEOUT=${CW_TIMEOUT:-300}
BACKGROUND=/usr/share/gnome-shell/perf-background.xml

mkdir -p "$LOG_DIR"
LOG_DIR=$(cd "$LOG_DIR" && pwd)

if [ $# -gt 0 ]; then
    TESTS=("$@")
else
    TESTS=("$ROOT"/tests/*.test.js)
fi

BUILD=$(mktemp -d -t cursor-wrap-build-XXXXXX)
trap 'rm -rf "$BUILD"' EXIT

echo "GNOME Shell: $(gnome-shell --version)"
echo "Logs: $LOG_DIR"

# Test the same zip a release would ship.
if ! (cd "$ROOT" && gnome-extensions pack --force --out-dir="$BUILD" --schema="$SCHEMA" .); then
    echo "FAIL could not pack the extension"
    exit 1
fi
cp "$BUILD/$ZIP" "$LOG_DIR/"

header() {
    sed -n "s|^// @$2 ||p" "$1" | head -n 1
}

stop_session() {
    local sid=$1 tries=0
    pkill -TERM -s "$sid" 2> /dev/null
    while pgrep -s "$sid" > /dev/null && [ $tries -lt 50 ]; do
        sleep 0.1
        tries=$((tries + 1))
    done
    pkill -KILL -s "$sid" 2> /dev/null
}

# The document portal, started on the private bus, mounts a FUSE file system
# in the private runtime directory and may still be unmounting it when the
# shell has exited.
cleanup_work() {
    local work=$1 tries=0
    while [ $tries -lt 50 ]; do
        if mountpoint -q "$work/runtime/doc" 2> /dev/null; then
            fusermount3 -u "$work/runtime/doc" 2> /dev/null || fusermount -u "$work/runtime/doc" 2> /dev/null
        fi
        rm -rf "$work" 2> /dev/null && return 0
        sleep 0.1
        tries=$((tries + 1))
    done
    echo "     warning: could not remove $work"
}

run_test() {
    local test=$1
    local name monitors session work result log status xvfb_pid=
    name=$(basename "$test" .test.js)
    monitors=$(header "$test" monitors)
    session=$(header "$test" session)
    monitors=${monitors:-1920x1080 1280x1024}
    session=${session:-wayland}
    result=$LOG_DIR/$name.result.json
    log=$LOG_DIR/$name.log
    rm -f "$result"

    local args=(--automation-script "$(cd "$(dirname "$test")" && pwd)/$(basename "$test")")
    local env_args=()

    if [ "$session" = x11 ]; then
        if ! gnome-shell --help 2>&1 | grep -q -- '--x11'; then
            echo "SKIP $name: this GNOME Shell has no X11 session"
            return 0
        fi
        if ! command -v Xvfb > /dev/null; then
            echo "SKIP $name: Xvfb is not installed"
            return 0
        fi
    fi

    work=$(mktemp -d -t cursor-wrap-run-XXXXXX)
    mkdir -m 700 "$work/runtime"
    mkdir -p "$work/data/gnome-shell/extensions/$UUID" "$work/config/glib-2.0/settings" "$work/cache"
    unzip -q "$BUILD/$ZIP" -d "$work/data/gnome-shell/extensions/$UUID"
    glib-compile-schemas --strict "$work/data/gnome-shell/extensions/$UUID/schemas"

    cat > "$work/config/glib-2.0/settings/keyfile" <<EOF
[org/gnome/shell]
enabled-extensions=['$UUID']
welcome-dialog-last-shown-version='999'

[org/gnome/desktop/interface]
enable-animations=false
enable-hot-corners=true
EOF

    if [ "$session" = x11 ]; then
        # Xvfb picks a free display number and writes it to fd 3.
        Xvfb -displayfd 3 -nolisten tcp -screen 0 "${monitors%% *}x24" \
            3> "$work/display" > "$work/xvfb.log" 2>&1 &
        xvfb_pid=$!
        local tries=0
        while [ ! -s "$work/display" ] && [ $tries -lt 100 ]; do
            sleep 0.1
            tries=$((tries + 1))
        done
        if [ ! -s "$work/display" ]; then
            echo "FAIL $name: Xvfb did not start"
            kill "$xvfb_pid" 2> /dev/null
            rm -rf "$work"
            return 1
        fi
        env_args+=(DISPLAY=":$(head -n 1 "$work/display")")
        args+=(--x11 --replace)
    else
        args+=(--headless --no-x11)
        local m
        for m in $monitors; do
            args+=(--virtual-monitor "$m")
        done
    fi
    [ -f "$BACKGROUND" ] && env_args+=(SHELL_BACKGROUND_IMAGE="$BACKGROUND")

    echo "RUN  $name ($session, monitors: $monitors)"
    # A new session groups GNOME Shell with the services its private bus
    # starts, so stragglers can be stopped once the shell has exited.
    setsid env -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS \
        XDG_RUNTIME_DIR="$work/runtime" \
        XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache" \
        GSETTINGS_BACKEND=keyfile CW_RESULT="$result" CW_ARTIFACT_DIR="$LOG_DIR" \
        "${env_args[@]}" \
        timeout --kill-after=10 "$TIMEOUT" \
        dbus-run-session -- gnome-shell "${args[@]}" > "$log" 2>&1 &
    local session_id=$!
    wait "$session_id"
    status=$?
    stop_session "$session_id"

    [ -n "$xvfb_pid" ] && kill "$xvfb_pid" 2> /dev/null
    cleanup_work "$work"

    grep '^\[cursor-wrap-test\] FAIL\|^\[cursor-wrap-test\] ERROR' "$log" | sed 's/^\[cursor-wrap-test\] /     /'

    # Any stack frame or message that points into the extension means it
    # threw or logged an error, even if every check passed.
    local errors
    errors=$(grep -n "extensions/$UUID/\|$UUID.*had error" "$log")

    if [ ! -f "$result" ]; then
        [ "$status" -eq 124 ] && echo "     timed out after ${TIMEOUT} s"
        echo "FAIL $name: no result (GNOME Shell exit status $status), see $log"
        tail -n 20 "$log" | sed 's/^/     | /'
        return 1
    fi
    if [ -n "$errors" ]; then
        echo "FAIL $name: errors from the extension in $log:"
        echo "$errors" | head -n 20 | sed 's/^/     | /'
        return 1
    fi

    local summary
    summary=$(python3 -c '
import json, sys
r = json.load(open(sys.argv[1]))
failed = len(r["failed"])
print("%d passed, %d failed%s on GNOME %s"
      % (r["passed"], failed, ", aborted" if r["error"] else "", r["gnome"]))
sys.exit(1 if failed or r["error"] else 0)' "$result")
    local ok=$?
    if [ "$ok" -eq 0 ]; then
        echo "PASS $name: $summary"
    else
        echo "FAIL $name: $summary"
    fi
    return "$ok"
}

failures=0
for test in "${TESTS[@]}"; do
    run_test "$test" || failures=$((failures + 1))
done

if [ "$failures" -gt 0 ]; then
    echo "$failures test file(s) failed. Logs: $LOG_DIR"
    exit 1
fi
echo "All tests passed. Logs: $LOG_DIR"
