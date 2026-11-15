#!/usr/bin/env bash
# Stage the AI Visibility listing from the same source: copies the repo without node_modules/.git and swaps in its actor.json.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; OUT="${1:-$ROOT/../stage-ai-visibility}"
rm -rf "$OUT"; mkdir -p "$OUT"
rsync -a --exclude node_modules --exclude .git --exclude deploy --exclude storage "$ROOT/" "$OUT/"
cp "$ROOT/deploy/ai-visibility/actor.json" "$OUT/.actor/actor.json"
[ -f "$ROOT/deploy/ai-visibility/README.md" ] && cp "$ROOT/deploy/ai-visibility/README.md" "$OUT/README.md"
rm -f "$OUT/.actor/output_schema.json"
echo "staged at $OUT"
