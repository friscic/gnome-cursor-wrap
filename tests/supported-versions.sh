#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Single source of truth for the supported GNOME versions: the shell-version
# array in metadata.json. The Makefile and CI read it from here so the test
# matrix, the canary job, and the published metadata can never drift apart.
#
# Usage:
#   tests/supported-versions.sh            # space-separated list: 48 49 50 51
#   tests/supported-versions.sh --json     # JSON array:          [48,49,50,51]
#   tests/supported-versions.sh --next     # first version not yet supported: 52
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
metadata=$here/../metadata.json

# shell-version holds strings in metadata.json; emit them as a sorted,
# de-duplicated list of integers so the rest of the tooling can treat them
# as numbers.
read_versions() {
    python3 -c '
import json, sys
with open(sys.argv[1]) as f:
    versions = json.load(f)["shell-version"]
print(" ".join(str(v) for v in sorted({int(x) for x in versions})))
' "$metadata"
}

versions=$(read_versions)

case "${1:-}" in
    ""|--list)
        echo "$versions"
        ;;
    --json)
        printf '[%s]\n' "$(echo "$versions" | tr ' ' ',')"
        ;;
    --next)
        # One past the highest supported version: the next GNOME the canary
        # job probes before it is officially supported.
        echo "$versions" | tr ' ' '\n' | sort -n | tail -1 | awk '{print $1 + 1}'
        ;;
    *)
        echo "usage: $0 [--list|--json|--next]" >&2
        exit 2
        ;;
esac
