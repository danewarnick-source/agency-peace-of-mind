# AWS parallel deployment (HIVE)

A second deploy target that runs **alongside** Lovable/Cloudflare, from the same
GitHub repo and main branch. Lovable's build, `wrangler.jsonc`, and
`src/server.ts`'s Cloudflare entry are untouched — nothing here changes how
Lovable deploys.

## What changed in the repo

- `vite.config.ts` — when `BUILD_TARGET=aws` is set, nitro's preset switches
  from `cloudflare-module` (Lovable's default) to `aws-lambda`, and output goes
  to `dist-aws/` instead of `.output/`. Lovable never sets this env var, so its
  build path is byte-for-byte unaffected.
- `package.json` — added `npm run build:aws`.
- `.gitignore` — added `dist-aws`.
- `.github/workflows/deploy-aws.yml` — builds with `build:aws` on every push to
  `main`, syncs `dist-aws/client` to S3, updates the Lambda function code from
  `dist-aws/server`, and invalidates CloudFront.
- `src/lib/ai-bedrock.server.ts` — added `sessionToken` to the Bedrock client
  credentials (see **Known limitation #1** below for why this was necessary).
  This is a no-op on Cloudflare/Lovable, where `AWS_SESSION_TOKEN` is never set.

The AWS build was run and verified locally: `npm run build:aws` produces
`dist-aws/server/index.mjs` (a Lambda `handler(event, context)` export, per
nitro's `aws-lambda` preset) and `dist-aws/client/` (static assets). The
default `npm run build` was also re-run and confirmed unaffected.

## Known limitations (read before you start)

1. **Bedrock credentials.** `src/lib/ai-bedrock.server.ts` reads
   `process.env.AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` directly — that's
   how it authenticates to Bedrock today under Cloudflare Workers (which has no
   IAM role concept, so it uses static long-lived keys). **On Lambda, these
   exact variable names are reserved** — Lambda auto-populates them (plus
   `AWS_SESSION_TOKEN`) with the execution role's temporary credentials, and
   will not let you override them in the console. That's actually fine (and
   more secure) *if* the execution role has Bedrock permission — but only
   because the code now also forwards `AWS_SESSION_TOKEN`. Grant the Lambda
   execution role `bedrock:InvokeModel` (Step 3 below) and do **not** try to
   set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` yourself in the Lambda
   console — it will reject the save.
2. **Lambda Function URL is directly reachable.** To keep this console-only
   and avoid standing up API Gateway, the SSR origin is a Lambda Function URL.
   CloudFront sits in front of it, but the Function URL itself is a public
   HTTPS endpoint — nothing stops someone from hitting it directly with the
   raw `*.lambda-url.<region>.on.aws` address, bypassing CloudFront. For a
   CloudFront-URL-only preview this is an acceptable tradeoff; before this
   carries real PHI traffic, harden it (a shared-secret header CloudFront adds
   and the app validates, or move to API Gateway + a resource policy, or add
   AWS WAF). Flagging this now so it's a conscious choice, not a surprise.

## Step 1 — Find your region and account ID

Use the **same region as your existing Bedrock setup**. Log into the AWS
console, check the region dropdown (top right) — that's what's already
selected when you use Bedrock. Also open
`https://console.aws.amazon.com/billing/home#/account` to find your 12-digit
**Account ID** (top right, click your name). Write both down — call them
`REGION` and `ACCOUNT_ID` below.

## Step 2 — Create the S3 bucket for static assets

1. Go to `https://s3.console.aws.amazon.com/s3/home?region=REGION`
2. Click **Create bucket**.
3. Bucket name: `hive-app-static` (must be globally unique — if taken, use
   `hive-app-static-<account-id>`).
4. Region: your `REGION`.
5. **Block Public Access settings**: leave all four boxes checked (bucket
   stays private — CloudFront reaches it via Origin Access Control, not public
   ACLs).
6. Leave everything else default. Click **Create bucket**.

## Step 3 — Create the Lambda execution role

1. Go to `https://console.aws.amazon.com/iam/home#/roles`
2. Click **Create role**.
3. Trusted entity type: **AWS service**. Use case: **Lambda**. Click **Next**.
4. Attach permissions policy: search for and check **AWSLambdaBasicExecutionRole**
   (AWS-managed, CloudWatch Logs only). Click **Next**.
5. Role name: `hive-lambda-execution-role`. Click **Create role**.
6. Open the role you just created, click **Add permissions → Create inline
   policy**, switch to the **JSON** tab, and paste:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "BedrockInvoke",
         "Effect": "Allow",
         "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
         "Resource": "*"
       }
     ]
   }
   ```

   (Scope `Resource` to your specific model ARN(s) if you want to lock it down
   further — `arn:aws:bedrock:REGION::foundation-model/<model-id>` — but `*`
   matches what Bedrock invoke policies typically need since cross-region
   inference profiles use a separate ARN namespace.)
7. Name the policy `hive-bedrock-invoke`, click **Create policy**.

## Step 4 — Create the Lambda function

1. Go to `https://console.aws.amazon.com/lambda/home?region=REGION#/create/function`
2. Choose **Author from scratch**.
3. Function name: `hive-app-server`.
4. Runtime: **Node.js 20.x**.
5. Architecture: **x86_64**.
6. Under **Change default execution role**, choose **Use an existing role**
   and select `hive-lambda-execution-role`.
7. Click **Create function**.
8. You'll land on the function page with a placeholder `index.js` — ignore it,
   the first GitHub Actions run will overwrite it. Go to **Configuration →
   General configuration → Edit**:
   - Memory: `1024` MB (SSR + bundled SDKs need headroom; adjust after you see
     real usage in CloudWatch).
   - Timeout: `30` sec.
   - Save.
9. **Configuration → Environment variables → Edit → Add environment variable**,
   add each of (values below in Step 8):
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `BEDROCK_MODEL_ID`

   Do **not** add `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or
   `AWS_SESSION_TOKEN` — these are Lambda-reserved names and the console will
   reject them. Lambda sets `AWS_REGION` itself (to `REGION`, correctly) and
   injects the execution role's temporary credentials under the other three
   automatically — that's exactly what Step 3's Bedrock policy is for.
10. **Configuration → Function URL → Create function URL**:
    - Auth type: **NONE**.
    - Leave CORS off (CloudFront + the app itself handle this).
    - Click **Save**. Copy the generated URL
      (`https://<id>.lambda-url.REGION.on.aws`) — you'll need it in Step 6.

## Step 5 — Create the CloudFront distribution

1. Go to `https://console.aws.amazon.com/cloudfront/v4/home?region=REGION#/distributions`
2. Click **Create distribution**.
3. **Origin 1 (static assets)**:
   - Origin domain: select your `hive-app-static` S3 bucket from the dropdown.
   - Origin access: **Origin access control settings (recommended)** → click
     **Create control setting** → accept defaults → **Create**.
   - Leave the rest default.
4. Click **Add origin** for **Origin 2 (SSR)**:
   - Origin domain: paste the Lambda Function URL host from Step 4.10
     (just the hostname, e.g. `abc123.lambda-url.REGION.on.aws`, no `https://`).
   - Protocol: **HTTPS only**.

   > **If there's no "Add origin" option** (some accounts/regions only allow
   > one origin in the creation wizard): finish creating the distribution
   > with just Origin 1, then add Origin 2 afterward — open the distribution
   > → **Origins** tab → **Create origin** → fill in the same Lambda
   > Function URL host + **HTTPS only** as above → Save. Then go to the
   > **Behaviors** tab → select **Default (\*)** → **Edit** → change its
   > **Origin** dropdown to the SSR origin you just created, and set the
   > Viewer protocol policy / allowed methods / cache policy / origin
   > request policy from Step 5.5 below → Save changes. Continue with Step 6
   > onward as written.
5. **Default cache behavior** (this becomes the catch-all `*` behavior):
   - Origin: the **Lambda Function URL** origin.
   - Viewer protocol policy: **Redirect HTTP to HTTPS**.
   - Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
     (TanStack Start server functions use POST).
   - Cache policy: **CachingDisabled** (SSR responses are per-request).
   - Origin request policy: **AllViewer** (forwards headers/cookies/query
     strings the app needs).
6. After creation, open the distribution → **Behaviors** tab → **Create
   behavior**, once for each of these path patterns, all pointing at the
   **S3 static-assets origin**, cache policy **CachingOptimized**:
   - `/assets/*`
   - `*.ico`
   - `*.png`
   - `*.webmanifest`
   - `/sw.js`
7. Confirm behavior order in the list: the 5 patterns above can be in any
   order relative to each other, but the **Default (\*)** behavior must sort
   last (CloudFront evaluates top to bottom, first match wins) — it will by
   default since explicit patterns always take precedence over `Default (*)`.
8. Back on the S3 bucket (Step 2), CloudFront will prompt you to update the
   bucket policy for the new Origin Access Control — click **Copy policy**
   from the distribution's origin settings, then go to your S3 bucket →
   **Permissions → Bucket policy → Edit**, paste it, **Save changes**. (If it
   doesn't prompt automatically: S3 console → bucket → Permissions → Bucket
   policy, and use this template, filling in your values:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AllowCloudFrontServicePrincipal",
         "Effect": "Allow",
         "Principal": { "Service": "cloudfront.amazonaws.com" },
         "Action": "s3:GetObject",
         "Resource": "arn:aws:s3:::hive-app-static/*",
         "Condition": {
           "StringEquals": {
             "AWS:SourceArn": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
           }
         }
       }
     ]
   }
   ```
   )
9. Wait for the distribution status to say **Enabled** / **Deployed** (5–15
   min). Copy the distribution's domain name (`d1234abcd.cloudfront.net`) —
   that's your app URL — and its **Distribution ID** (used in GitHub secrets).

## Step 6 — Create the IAM user for GitHub Actions

1. Go to `https://console.aws.amazon.com/iam/home#/users`
2. Click **Create user**. Name: `hive-github-deploy`. Do **not** check "Provide
   user access to the AWS Management Console." Click **Next**.
3. **Attach policies directly → Create policy** (opens a new tab), JSON tab,
   paste (replace `REGION`, `ACCOUNT_ID`, `DISTRIBUTION_ID`):

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "S3StaticAssets",
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
         "Resource": ["arn:aws:s3:::hive-app-static", "arn:aws:s3:::hive-app-static/*"]
       },
       {
         "Sid": "LambdaDeploy",
         "Effect": "Allow",
         "Action": ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
         "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:hive-app-server"
       },
       {
         "Sid": "CloudFrontInvalidate",
         "Effect": "Allow",
         "Action": ["cloudfront:CreateInvalidation"],
         "Resource": "arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID"
       }
     ]
   }
   ```

   Name it `hive-github-deploy-policy`, **Create policy**. Back in the first
   tab, refresh the policy list, check `hive-github-deploy-policy`, **Next**,
   **Create user**.
4. Open the new `hive-github-deploy` user → **Security credentials** tab →
   **Access keys → Create access key** → choose **Third-party service** →
   check the acknowledgement → **Next** → **Create access key**.
5. Copy the **Access key ID** and **Secret access key** now — the secret is
   only shown once.

## Step 7 — GitHub repository secrets

Go to `https://github.com/danewarnick-source/agency-peace-of-mind/settings/secrets/actions`
and add each of these (**Repository secret**, not environment secret):

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from Step 6.5 |
| `AWS_SECRET_ACCESS_KEY` | from Step 6.5 |
| `AWS_REGION` | your `REGION` |
| `AWS_S3_BUCKET` | `hive-app-static` |
| `AWS_LAMBDA_FUNCTION_NAME` | `hive-app-server` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | from Step 5.9 |
| `AWS_PUBLIC_SITE_URL` | `https://<your-cloudfront-domain>` from Step 5.9 |
| `SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `VITE_SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | current value from your local `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | current value from your local `.env` |
| `VITE_SUPABASE_PROJECT_ID` | `mmknqtdrefbzwfdtykza` |

This workflow reuses the existing GitHub Actions integration already on this
repo (`.github/workflows/typecheck-lint.yml`) — no new GitHub App or
permissions are needed, just these secrets.

## Step 8 — Lambda environment variables (runtime, not build-time)

Back in the Lambda console (Step 4.9), fill in the three variables you added:

- `SUPABASE_URL` = `https://mmknqtdrefbzwfdtykza.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = current value from your local `.env`
- `BEDROCK_MODEL_ID` = current value from your existing Bedrock setup (same
  one already in use for Lovable/Cloudflare)

## Step 9 — First deploy

Push any commit to `main` (including this one) — the `Deploy AWS (parallel
target)` workflow runs automatically. Watch it at
`https://github.com/danewarnick-source/agency-peace-of-mind/actions`.

If it fails on the S3 or Lambda step, it's almost always a secret name typo or
an IAM policy `Resource` ARN that doesn't match your actual bucket/function
name — check the Actions log, it names the failing AWS call directly.

## Finding your CloudFront URL

`https://console.aws.amazon.com/cloudfront/v4/home?region=REGION#/distributions`
→ click your distribution → the **Domain name** field
(`https://d1234abcd.cloudfront.net`) is your live AWS deployment. Open it in a
browser once the first Actions run finishes to verify the app renders and can
reach Supabase.
