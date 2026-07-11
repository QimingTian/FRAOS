#!/usr/bin/env bash
# Copy Stellarium Web test skydata + Roboto fonts into control-client public/.
# Requires ../third-party/stellarium-web-engine (Atlas upstream reference).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/../../../third-party/stellarium-web-engine"

if [[ ! -d "$ENGINE/apps/test-skydata" ]]; then
  echo "error: missing $ENGINE/apps/test-skydata — clone https://github.com/Stellarium/stellarium-web-engine" >&2
  exit 1
fi

rm -rf "$ROOT/public/skydata"
cp -R "$ENGINE/apps/test-skydata" "$ROOT/public/skydata"
mkdir -p "$ROOT/public/fonts"
cp "$ENGINE/apps/web-frontend/public/fonts/Roboto-Regular.ttf" "$ROOT/public/fonts/"
cp "$ENGINE/apps/web-frontend/public/fonts/Roboto-Bold.ttf" "$ROOT/public/fonts/"
echo "Synced public/skydata and public/fonts (Roboto TTF)."
