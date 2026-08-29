#!/usr/bin/env bash
# Zip Nitro aws-lambda server output for existing hive-app-server.
# Does not call AWS. Run after npm run build:lambda.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
server="$root/.output/server"
out="$root/lambda-server.zip"

if [[ ! -f "$server/index.mjs" ]]; then
  echo "[package-lambda] missing $server/index.mjs — run npm run build:lambda" >&2
  exit 1
fi

# Nitro emits `async function handler` plus `export { handler }` (multiline).
if ! grep -q 'async function handler' "$server/index.mjs" || ! grep -A5 '^export {' "$server/index.mjs" | grep -q 'handler'; then
  echo "[package-lambda] $server/index.mjs has no handler export" >&2
  exit 1
fi

rm -f "$out"
# Zip contents (not the server/ directory) so Lambda handler is index.handler.
(cd "$server" && zip -qr "$out" .)
bytes="$(wc -c < "$out" | tr -d ' ')"
echo "[package-lambda] wrote $out (${bytes} bytes) for hive-app-server index.handler"
