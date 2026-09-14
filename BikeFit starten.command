#!/bin/bash
# Double-click on a Mac (one-time setup may copy this to the Desktop).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:$PATH"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
if ! command -v node >/dev/null 2>&1; then
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'display dialog "Node.js fehlt. Einmalige Einrichtung steht in docs/TESTER.md" buttons {"OK"} default button "OK" with title "BikeFit"' >/dev/null
  fi
  echo "Node.js fehlt. Siehe docs/TESTER.md" >&2
  exit 1
fi
exec node --experimental-strip-types --no-warnings "$ROOT/scripts/start-local.ts"
