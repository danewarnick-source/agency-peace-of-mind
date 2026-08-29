# AWS Lambda + CloudFront host (HIVE)

Hive frontend leaves ECS. This path is **Nitro `aws-lambda`** (handler
`index.handler` in `.output/server`) + **S3** (`.output/public`) + the
**existing CloudFront** distribution. Vercel production and Hive-Platform
Supabase stay untouched.

Do **not** merge PR 189. Do **not** restore Compass. Do **not** run
`ecs UpdateService` from this work. This document is the console + zip
recipe — the repo has no CDK.

## Build (does not touch Vercel)

| Command | `BUILD_TARGET` | Output | Used by |
|---|---|---|---|
| `npm run build` | unset | default Vite / TanStack (Vercel / Lovable) | production Vercel |
| `npm run build:aws` | `aws` | `dist-aws/server` + `dist-aws/client` | old node-server / ECS image |
| `npm run build:lambda` | `lambda` | `.output/server` (`index.handler`) + `.output/public` | **this host** |

```bash
npm ci
npm run build:lambda
node scripts/verify-lambda-output.mjs
```

Prove locally:

- `.output/server/index.mjs` exports `handler` (Lambda runtime setting: `index.handler`)
- `.output/public` has hashed `/assets/*` (sync this tree to the existing S3 bucket)

`nitro.config.ts` sets `serveStatic: false` on this target so asset hits that
miss the CloudFront `/assets/*` behavior do not ENOENT inside Lambda.

### Vite / Nitro note

This repo's Nitro is `3.0.260603-beta`. Official Nitro 3 docs call the
preset `aws_lambda`. TanStack Start / older Nitro accepted `aws-lambda`.
`src/lib/nitro-lambda-preset.ts` is the single string passed to
`vite.config.ts`. If `npm run build:lambda` rejects the alias, change
that constant to `aws_lambda` and rebuild. Do not set `BUILD_TARGET` on
the Vercel build.

**Known risk (do not hide):** a previous Hive attempt at Nitro's own
`aws-lambda` preset 500'd every TanStack `_serverFn` *inside a real
Lambda invocation* (framework route dispatch, never app code). ECS
`node-server` was the workaround. This branch ships the same JSON-500
guards + `getSession` boot timeout so a repeat of that failure cannot
spin CloudFront `Loading…`. Confirm `_serverFn` on a **non-production**
Function URL before cutting the live CloudFront default origin over.

## CloudFront (existing distribution)

Prefer **Lambda Function URL + CloudFront**. Do not add API Gateway unless
Function URL is blocked.

1. Create a Node.js 20 Lambda from a zip of **`.output/server/*`** (zip
   root = contents of `.output/server`, so the handler is `index.handler`).
   Memory 1024–2048 MB. Timeout 30s.
2. Enable a **Function URL** (auth type **NONE** — CloudFront is the public
   edge). CORS can stay default; viewers never hit the Function URL
   directly once CloudFront is the origin.
3. Existing S3 bucket (`hive-app-static` or the live name): sync
   `.output/public`. Keep the current `/assets/*` (and icon / manifest)
   behaviors on S3.
4. CloudFront **default (\*) origin** becomes the Function URL hostname
   (HTTPS only). Do not leave the ALB as the default origin.
5. Default behavior:
   - Methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE (`_serverFn` is POST)
   - Cache policy: **CachingDisabled**
   - Origin request policy: **AllViewerExceptHostHeader**
6. Custom origin header on the Lambda origin:
   - `x-origin-verify` = the same value as Lambda env `ALB_ORIGIN_VERIFY_SECRET`
   - The Nitro plugin `src/nitro-plugins/alb-origin-verify.ts` fail-closes
     when that env is set.

**AllViewerExceptHostHeader is required.** It forwards query string,
`Authorization`, and cookies, and it **does not** forward `Host`.
Function URLs reject a CloudFront `Host`. `AllViewer` (the old ALB
policy) breaks `_serverFn`. Do not invent a CSP header; live CloudFront
has none.

## Lambda environment (Hive-Platform Supabase — same as ECS)

Set these on the **Lambda function**. Never `echo` / log / commit values.
Never put the service role in a `VITE_*` var.

### Required at runtime

| Name | Purpose |
|---|---|
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Hive-Platform project URL (same value as ECS / `https://mmknqtdrefbzwfdtykza.supabase.co`) |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key (same as ECS). Browser also needs the matching `VITE_*` at **build** time. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. `src/integrations/supabase/client.server.ts`. Never expose. |
| `AWS_REGION` | `us-east-1` (Bedrock + this Lambda) |
| `BEDROCK_MODEL_ID` | Same model id as the ECS task |
| `ALB_ORIGIN_VERIFY_SECRET` | Shared secret CloudFront injects as `x-origin-verify` |
| `PUBLIC_SITE_URL` | `https://<distribution>.cloudfront.net` (or the custom domain) |

`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are **not** required when
the Lambda execution role can `bedrock:InvokeModel` (same as the ECS
task role). The SDK default chain picks up the role.

### Required at `build:lambda` time (baked into client JS)

| Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Same Hive-Platform URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Same publishable key |
| `VITE_SUPABASE_PROJECT_ID` | `mmknqtdrefbzwfdtykza` |
| `PUBLIC_SITE_URL` | CloudFront (or custom) origin for absolute links |

### Optional (same names as ECS / Vercel)

| Name | Purpose |
|---|---|
| `BEDROCK_EMBEDDING_MODEL_ID` | Defaults to Titan embed v2 if unset |
| `PUBLIC_APP_URL` / `APP_ORIGIN` | Stripe / SMS / audit-portal absolute URLs |
| `STRIPE_SECRET_KEY` | Test-mode only (`sk_test_…`). Live keys are rejected. |
| `STRIPE_PUBLISHABLE_KEY` | Test publishable |
| `STRIPE_WEBHOOK_SECRET` | Webhook verify. Point Stripe at CloudFront `/api/public/webhooks/stripe`. |
| `STRIPE_PRICE_*` / `STRIPE_COUPON_*` | Overrides; sandbox Price IDs are code defaults |

Auth server functions use `(supabase as any)` and the publishable-key
browser client (`persistSession` + `localStorage`). No PHI in logs.

## Zip + S3 (manual; this agent does not deploy)

```bash
# after npm run build:lambda
cd .output/server && zip -r ../../lambda-server.zip . && cd ../..
aws s3 sync .output/public "s3://${AWS_S3_BUCKET}" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.webmanifest"
```

Then update the Lambda code zip (`index.handler`) and invalidate
CloudFront `/*` from the console. Do not point the live distribution at
this build until `_serverFn` is confirmed on a scratch Function URL.

## Hang fixes that ship with this host

Ported from PR 190 (not merged here as ECS work):

- `attachGetSessionBoot` — 2.5s timeout + `.catch` so CloudFront cannot
  spin on `getSession`
- Dashboard shell uses `dashboardShellShowsLoading` (does not block
  forever on `session.loading` / `currentOrg.isLoading`)
- JSON 500s stay JSON for POST / `_serverFn` (`catastrophic-ssr`)
- `defineNitroPlugin`-safe origin-verify plugin (plain export)
- Progress-summary ensure skips orphan billing rows (FK 500)

`useCurrentOrg` stays a browser `useQuery` on `organization_members`
with null checks — not `RequirePermission`.
