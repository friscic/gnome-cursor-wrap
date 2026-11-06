#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Container entry point. GNOME Shell needs a system bus with logind, which a
# container does not have, so start a system bus with a mock logind, then run
# the tests from the repository mounted at /src.

set -uo pipefail

mkdir -p /run/dbus
dbus-daemon --system --fork --nopidfile
python3 -m dbusmock --system --template logind > /tmp/logind-mock.log 2>&1 &

for _ in $(seq 100); do
    if dbus-send --system --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus \
        org.freedesktop.DBus.NameHasOwner string:org.freedesktop.login1 2> /dev/null | grep -q true; then
        break
    fi
    sleep 0.1
done

/src/tests/run.sh "$@"
status=$?

# Hand the logs back to whoever owns the mounted log directory.
if [ -n "${CW_LOG_DIR:-}" ] && [ -d "$CW_LOG_DIR" ]; then
    chown -R "$(stat -c %u:%g "$CW_LOG_DIR")" "$CW_LOG_DIR"
fi
exit $status
