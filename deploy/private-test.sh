#!/usr/bin/env bash
# Deploys the AI Visibility profile as a PRIVATE Apify Actor (steadfeed/ai-visibility-mcp) and runs the hosted MCP tests.
# Needs a logged-in Apify CLI (`apify login --method oauth2`). Never prints the token. Spends ~$0.10-0.20.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/.."; STAGE="$ROOT/../stage-ai-visibility"; OUT="$ROOT/../test-results"
mkdir -p "$OUT"
APIFY_TOKEN="$(apify auth token 2>/dev/null | tail -1)"; export APIFY_TOKEN
[ ${#APIFY_TOKEN} -gt 20 ] || { echo "Apify CLI is not logged in"; exit 1; }
"$HERE/stage.sh" "$STAGE"
( cd "$STAGE" && apify push --no-prompt 2>&1 | grep -v -i token | tail -5 )
# Keep it private; single-tenant so each caller's run (and bill) is their own.
apify api PUT "acts/steadfeed~ai-visibility-mcp" -d '{"isPublic":false,"actorStandby":{"isEnabled":true,"tenancy":"SINGLE_TENANT","desiredRequestsPerActorRun":4,"maxRequestsPerActorRun":8,"idleTimeoutSecs":120,"memoryMbytes":256}}' >/dev/null
URL="https://steadfeed--ai-visibility-mcp.apify.actor/mcp"
cd "$ROOT"
node scripts/mcp-client.mjs "$URL" list > "$OUT/hosted-tools.json" 2> "$OUT/hosted-tools.err" || true
for site in https://getsteadfeed.com https://basecamp.com https://www.etsy.com; do
  n=$(echo "$site" | sed 's#https://##; s#[^a-z0-9]#-#g')
  node scripts/mcp-client.mjs "$URL" call ai_visibility_report "{\"url\":\"$site\"}" > "$OUT/hosted-report-$n.json" 2> "$OUT/hosted-report-$n.err" || true
done
node scripts/mcp-client.mjs "https://mcp.apify.com/?tools=steadfeed/ai-visibility-mcp" list > "$OUT/via-mcp-apify-com-tools.json" 2> "$OUT/via-mcp-apify-com-tools.err" || true
grep -rl "$APIFY_TOKEN" "$OUT" && { echo "TOKEN FOUND IN OUTPUT - deleting"; grep -rl "$APIFY_TOKEN" "$OUT" | xargs rm -f; } || true
echo "done: $OUT"
