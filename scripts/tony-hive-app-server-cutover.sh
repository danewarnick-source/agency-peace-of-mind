#!/usr/bin/env bash
# Tony-only. Updates existing hive-app-server + hive-app-static.
# Does NOT edit CloudFront E1BPLMZE2XLSKD (origin 3 / default behavior
# stay a console step). Does NOT touch hive-cognito-user-migration,
# hive-platform-storage, ECS UpdateService, or Vercel.
#
#   CONFIRM=I_AM_TONY bash scripts/tony-hive-app-server-cutover.sh
set -euo pipefail

if [[ "${CONFIRM:-}" != "I_AM_TONY" ]]; then
  echo "[tony-cutover] refuse: set CONFIRM=I_AM_TONY (this agent must not run this)" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
zip="$root/lambda-server.zip"
region="us-east-1"
fn="hive-app-server"
bucket="hive-app-static"

if [[ ! -f "$zip" ]]; then
  echo "[tony-cutover] missing $zip — run bash scripts/package-lambda.sh" >&2
  exit 1
fi

aws lambda update-function-code \
  --function-name "$fn" \
  --zip-file "fileb://$zip" \
  --region "$region"

# LWA + run.sh are the old node-server adapter. Nitro aws-lambda is index.handler.
# Layers= is an empty list: drop the LWA layer. Runtime stays nodejs24.x.
aws lambda update-function-configuration \
  --function-name "$fn" \
  --handler index.handler \
  --layers \
  --region "$region"

aws lambda wait function-updated --function-name "$fn" --region "$region"

aws s3 sync "$root/.output/public" "s3://$bucket" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.webmanifest"

echo "[tony-cutover] hive-app-server code + hive-app-static synced."
echo "[tony-cutover] NEXT (console, not this script): CloudFront E1BPLMZE2XLSKD origin 3 DomainName -> 4wadoqttka47octom5yvlwk5lq0xtbnl.lambda-url.us-east-1.on.aws ; default behavior -> that origin; keep CachingDisabled + AllViewerExceptHostHeader; invalidate /*."
