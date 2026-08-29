# AWS Lambda + CloudFront host (HIVE)

Reuse the **existing** account `684707794522` / `us-east-1` stack. Do not
create a new Lambda, S3 bucket, CloudFront distribution, API Gateway, or
CDK app. Vercel production and Hive-Platform Supabase stay untouched.
Leave `hive-cognito-user-migration` alone. Do not use
`hive-platform-storage`. Do **not** merge PR 189. Do **not** restore
Compass. This agent does **not** `ecs UpdateService` and does **not**
edit live CloudFront.

## Existing inventory (do not invent)

| Resource | Id |
|---|---|
| Lambda (replace code) | `hive-app-server` (nodejs24.x). Handler today is `run.sh` + LWA layer. Target handler: `index.handler`. |
| Function URL (keep) | `https://4wadoqttka47octom5yvlwk5lq0xtbnl.lambda-url.us-east-1.on.aws/` AuthType NONE |
| S3 (upload public) | `hive-app-static` (already OAC'd to the distribution below) |
| CloudFront | `E1BPLMZE2XLSKD` / `d2j3kgagxghm5i.cloudfront.net` |
| Default CF behavior today | ALB origin. Must stay **CachingDisabled** + **AllViewerExceptHostHeader**. |
| Function URL origin | Origin **3** already exists; `DomainName` is still the ALB (half-finished). |
| Secret | `hive/ecs/supabase-service-role` (maps to `SUPABASE_SERVICE_ROLE_KEY`; never print) |

No API Gateway. CloudFront → Function URL only.

## Build (this agent's job)

```bash
npm ci
npm run build:lambda
node scripts/verify-lambda-output.mjs
bash scripts/package-lambda.sh
```

| Command | `BUILD_TARGET` | Output |
|---|---|---|
| `npm run build` | unset | Vercel / Lovable (unchanged) |
| `npm run build:aws` | `aws` | `dist-aws/` node-server / ECS image (unchanged) |
| `npm run build:lambda` | `lambda` | `.output/server` (`index.handler`) + `.output/public` |
| `bash scripts/package-lambda.sh` | — | `lambda-server.zip` (contents of `.output/server`) |

Installed Nitro `3.0.260603-beta` official preset name is `aws-lambda`
(`aws_lambda` is an alias). `src/lib/nitro-lambda-preset.ts` is the
single string. `nitro.config.ts` sets `serveStatic: false` so asset
misses do not ENOENT inside Lambda.

**Known risk:** a previous Hive attempt at this preset 500'd every
`_serverFn` inside a real Lambda invoke. This branch ships the JSON-500
guards + `getSession` boot timeout so a repeat cannot spin CloudFront
`Loading…`. Tony should hit `_serverFn` on the existing Function URL
after the code swap, **before** retargeting CloudFront origin 3.

## Tony cutover (later — not this agent)

Copy-paste after `build:lambda` + `package-lambda.sh`. Requires AWS
creds for account `684707794522`. The script
`scripts/tony-hive-app-server-cutover.sh` does steps 1–3 only when
`CONFIRM=I_AM_TONY`. Step 4 is console (this agent must not change CF).

1. **Zip is already** `lambda-server.zip` (root = `.output/server`, so
   handler is `index.handler`).
2. **Replace `hive-app-server` code** (not `hive-cognito-user-migration`):
   - `aws lambda update-function-code --function-name hive-app-server --zip-file fileb://lambda-server.zip --region us-east-1`
   - Set handler to `index.handler`. Remove the LWA layer (`run.sh` is gone).
   - Keep nodejs24.x. Keep the existing Function URL.
   - Runtime env (same Hive-Platform values as ECS; never print):
     `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY` (from secret `hive/ecs/supabase-service-role`),
     `AWS_REGION=us-east-1`, `BEDROCK_MODEL_ID`, `ALB_ORIGIN_VERIFY_SECRET`,
     `PUBLIC_SITE_URL=https://d2j3kgagxghm5i.cloudfront.net`.
     Build-time already baked: `VITE_SUPABASE_URL`,
     `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
3. **Sync static to existing S3 only:**
   `aws s3 sync .output/public s3://hive-app-static --delete` (not
   `hive-platform-storage`). `/assets/*` behaviors already point here.
4. **Retarget CloudFront `E1BPLMZE2XLSKD` origin 3:** set `DomainName` to
   `4wadoqttka47octom5yvlwk5lq0xtbnl.lambda-url.us-east-1.on.aws`
   (no `https://`). Point the **default** behavior at that origin.
   Keep **CachingDisabled** + **AllViewerExceptHostHeader**. Do not
   invent a CSP. Then invalidate `/*`.

`AllViewerExceptHostHeader` forwards query + `Authorization` and drops
`Host`. Function URLs reject a CloudFront `Host`. `AllViewer` breaks
`_serverFn`.

## Hang fixes that ship on this Lambda

Ported from PR 190 onto latest main (not ECS Docker/task-def):

- `attachGetSessionBoot` — 2.5s timeout + `.catch`
- Dashboard `dashboardShellShowsLoading` (does not block forever)
- JSON 500s stay JSON for POST / `_serverFn`
- Plain-export origin-verify (Function URL + node-server headers)
- Progress-summary ensure skips orphan billing rows (FK 500)

`useCurrentOrg` stays a browser `useQuery` with null checks — not
`RequirePermission`. `(supabase as any)`. No UI emoji. No PHI in logs.
No RLS/migrations.
