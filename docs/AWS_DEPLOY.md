# AWS parallel deployment (HIVE)

A second deploy target that runs **alongside** Lovable/Cloudflare, from the same
GitHub repo and main branch. Lovable's build, `wrangler.jsonc`, and
`src/server.ts`'s Cloudflare entry are untouched — nothing here changes how
Lovable deploys.

## What changed in the repo

- `vite.config.ts` — when `BUILD_TARGET=aws` is set, nitro's preset switches
  from `cloudflare-module` (Lovable's default) to `node-server`, and output
  goes to `dist-aws/` instead of `.output/`. Lovable never sets this env var,
  so its build path is byte-for-byte unaffected.
- `nitro.config.ts` — disables nitro's built-in static-asset serving for the
  AWS build only (static assets are served from S3/CloudFront, not the app
  container itself). No-op for Lovable/Cloudflare.
- `deploy/aws/Dockerfile` — packages the already-built `dist-aws/server`
  (nitro's `node-server` output — a normal, long-running Node HTTP server,
  self-contained, no `npm install` needed in the image) into a container
  image for **AWS App Runner**.
- `.dockerignore` — keeps the image build fast; it only ever needs
  `dist-aws/server/`.
- `package.json` — added `npm run build:aws`.
- `.gitignore` — added `dist-aws`.
- `.github/workflows/deploy-aws.yml` — builds with `build:aws` on every push
  to `main`, builds+pushes a Docker image to ECR, syncs `dist-aws/client` to
  S3, deploys the new image to App Runner, and invalidates CloudFront.
- `src/lib/ai-bedrock.server.ts` — Bedrock client credentials now fall back to
  the AWS SDK's default credential provider chain (which auto-resolves App
  Runner's instance-role credentials) whenever `AWS_ACCESS_KEY_ID`/
  `AWS_SECRET_ACCESS_KEY` aren't set as literal env vars. No-op change for
  Cloudflare/Lovable, which still sets those explicitly.

`npm run build:aws` produces `dist-aws/server/index.mjs` — a normal,
long-running Node HTTP server (nitro's `node-server` preset) — plus
`dist-aws/client/` (static assets). It's containerized and run on
**AWS App Runner**, an always-on managed container service. The default
`npm run build` is unaffected.

> **Migration note (2026-07-30):** this originally ran on **Lambda** — first
> via nitro's own `aws-lambda` preset, later via nitro's `node-server` preset
> behind the AWS Lambda Web Adapter. Both hit the same unresolved issue: every
> server-function call 500'd inside framework-internal route dispatch, and
> the failure was only reproducible *inside real Lambda* — a direct local
> replay of the exact same request (same code, same headers, same auth
> token), captured via CloudWatch and the browser's Network tab, completed
> successfully every time. That pointed at something specific to Lambda's
> freeze/thaw request lifecycle rather than the application code, so this
> moved to App Runner: the exact same container, run as a normal always-on
> process — no Lambda invocation model involved at all. If you set this up
> before this date and have an existing Lambda function + Lambda Web Adapter
> layer sitting around, you can leave it (harmless, and cheap while idle) or
> delete it once App Runner is confirmed working — nothing here depends on it
> anymore.

## Known limitations (read before you start)

1. **App Runner service URL is directly reachable.** To keep this
   console-only and avoid standing up an ALB, the SSR origin is App Runner's
   own default domain (`*.awsapprunner.com`). CloudFront sits in front of it,
   but that domain itself is a public HTTPS endpoint — nothing stops someone
   from hitting it directly, bypassing CloudFront. For a CloudFront-URL-only
   preview this is an acceptable tradeoff; before this carries real PHI
   traffic, harden it (a shared-secret header CloudFront adds and the app
   validates, or restrict the App Runner service with a VPC ingress
   connector so only CloudFront/a private path can reach it). Flagging this
   now so it's a conscious choice, not a surprise.
2. **App Runner runs continuously**, unlike Lambda's pay-per-invocation
   model — you're billed for the instance the whole time it's running, not
   just when it's actively handling a request. At the smallest instance size
   this is a modest, predictable monthly cost rather than "basically free at
   idle" the way Lambda was.

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

## Step 3 — Create the App Runner instance role

This is the role your **application code** runs as at runtime (equivalent to
a Lambda execution role) — it's what lets `src/lib/ai-bedrock.server.ts` call
Bedrock without any static credentials.

1. Go to `https://console.aws.amazon.com/iam/home#/roles`
2. Click **Create role**.
3. Trusted entity type: **Custom trust policy**. (App Runner does have an
   **AWS service** use case, but it is missing from the use-case list in
   several IAM console versions — the custom trust policy below produces a
   byte-identical role, so just use it unconditionally.) Paste:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "Service": "tasks.apprunner.amazonaws.com" },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

   The principal must be `tasks.apprunner.amazonaws.com` — that is the
   *instance* role principal (what your container runs as). Plain
   `apprunner.amazonaws.com` is the App Runner *service's* own principal, used
   for the separate ECR-access role you'll create from inside the service
   wizard in Step 4a. Getting these two backwards makes the role
   un-selectable in the Step 4a instance-role dropdown.
4. Click **Next**. Skip attaching a managed policy — click **Next** again.
5. Role name: `hive-apprunner-instance-role`. Click **Create role**.
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

## Step 4 — Create the ECR repository and bootstrap the first image

App Runner needs to be pointed at an image that already exists in ECR — so
the very first image has to be pushed *before* the service can be created.
GitHub Actions does this for you; you don't need Docker installed locally.

1. Go to `https://console.aws.amazon.com/ecr/repositories?region=REGION`
2. Click **Create repository**.
3. Visibility: **Private**. Name: `hive-app-server`.
4. Leave everything else default. Click **Create repository**. Copy the
   **URI** shown (e.g. `ACCOUNT_ID.dkr.ecr.REGION.amazonaws.com/hive-app-server`)
   — you won't need the full URI directly, just confirm the repository name.
5. **Before continuing to Step 4a**, go set up Step 6 (IAM user policy) and
   Step 7 (GitHub secrets) enough to let the workflow run — at minimum
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`,
   `AWS_S3_BUCKET`, `AWS_ECR_REPOSITORY` (`hive-app-server`), and the
   `SUPABASE_*`/`BEDROCK_MODEL_ID`/`PUBLIC_SITE_URL` build-time secrets (a
   placeholder value for `AWS_PUBLIC_SITE_URL` is fine for now — you'll come
   back and fix it in Step 5). Leave `AWS_APPRUNNER_SERVICE_ARN` and
   `AWS_CLOUDFRONT_DISTRIBUTION_ID` **unset** for now — the workflow skips
   the App Runner deploy and CloudFront invalidation steps gracefully when
   they're empty, so this first run will just build and push an image to ECR.
6. Push a commit to `main` (or re-run the workflow) and confirm in
   `https://github.com/danewarnick-source/agency-peace-of-mind/actions` that
   it succeeds through the "Build and push Docker image" step. Then check
   `https://console.aws.amazon.com/ecr/repositories/private/ACCOUNT_ID/hive-app-server?region=REGION`
   — you should see an image tagged `latest`.

## Step 4a — Create the App Runner service

1. Go to `https://console.aws.amazon.com/apprunner/home?region=REGION#/services/create`
2. **Source**: Container registry → **Amazon ECR** → **Browse** → select the
   `hive-app-server` repository → tag: `latest`.
3. **Deployment trigger**: **Manual**. (The GitHub Actions workflow triggers
   deployments itself via `aws apprunner start-deployment` after pushing a
   new image — automatic trigger would race with that and isn't needed.)
4. For the ECR access role prompt (a *separate* role from Step 3 — this one
   just lets the App Runner *service* pull images from your private ECR
   repo, it has nothing to do with your app's own runtime permissions):
   choose **Create new service role** and accept the default name/settings.
5. Click **Next**.
6. **Service settings**:
   - Service name: `hive-app-server`.
   - Virtual CPU / memory: **1 vCPU / 2 GB** is a reasonable starting point
     (SSR + bundled SDKs need headroom) — adjust later based on real usage.
   - Port: `8080` (matches the Dockerfile's `EXPOSE 8080` / `ENV PORT=8080`).
7. **Environment variables** — add each of:
   - `SUPABASE_URL` = `https://mmknqtdrefbzwfdtykza.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = current value from your local `.env`
   - `BEDROCK_MODEL_ID` = current value from your existing Bedrock setup
   - `AWS_REGION` = your `REGION` (App Runner does **not** auto-inject this
     the way Lambda does — set it explicitly)

   You do **not** need to set `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`/
   `AWS_SESSION_TOKEN` at all — the AWS SDK inside the container
   auto-discovers the instance role's temporary credentials via App Runner's
   container credentials endpoint. That's exactly what the
   `ai-bedrock.server.ts` fallback added for this migration handles.
8. **Security** → **Instance role**: select `hive-apprunner-instance-role`
   (from Step 3) — this is what actually grants the running container
   Bedrock access.
9. **Health check**: leave defaults (TCP on the service port is fine — the
   app doesn't need a dedicated health-check route).
10. Click **Next**, review, **Create & deploy**.
11. Wait for the service status to reach **Running** (a few minutes). Copy
    the **Default domain** shown (e.g. `abc123.REGION.awsapprunner.com`) —
    you'll need it in Step 5. Also copy the service's **ARN** (top of the
    page, or **Actions → Copy ARN**) — you'll need it in Step 7.

## Step 5 — Create the CloudFront distribution

1. Go to `https://console.aws.amazon.com/cloudfront/v4/home?region=REGION#/distributions`
2. Click **Create distribution**.
3. **Origin 1 (static assets)**:
   - Origin domain: select your `hive-app-static` S3 bucket from the dropdown.
   - Origin access: **Origin access control settings (recommended)** → click
     **Create control setting** → accept defaults → **Create**.
   - Leave the rest default.
4. Click **Add origin** for **Origin 2 (SSR)**:
   - Origin domain: paste the App Runner **Default domain** host from Step
     4a.11 (just the hostname, e.g. `abc123.REGION.awsapprunner.com`, no
     `https://`).
   - Protocol: **HTTPS only**.

   > **If there's no "Add origin" option** (some accounts/regions only allow
   > one origin in the creation wizard): finish creating the distribution
   > with just Origin 1, then add Origin 2 afterward — open the distribution
   > → **Origins** tab → **Create origin** → fill in the same App Runner
   > domain + **HTTPS only** as above → Save. Then go to the **Behaviors**
   > tab → select **Default (\*)** → **Edit** → change its **Origin**
   > dropdown to the SSR origin you just created, and set the Viewer
   > protocol policy / allowed methods / cache policy / origin request
   > policy from Step 5.5 below → Save changes. Continue with Step 6 onward
   > as written.
5. **Default cache behavior** (this becomes the catch-all `*` behavior):
   - Origin: the **App Runner** origin.
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
   paste (replace `REGION`, `ACCOUNT_ID`, `DISTRIBUTION_ID`, and
   `APPRUNNER_SERVICE_ID` — the last segment of the service ARN from
   Step 4a.11, after the final `/`):

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
         "Sid": "ECRAuth",
         "Effect": "Allow",
         "Action": ["ecr:GetAuthorizationToken"],
         "Resource": "*"
       },
       {
         "Sid": "ECRPush",
         "Effect": "Allow",
         "Action": [
           "ecr:BatchCheckLayerAvailability",
           "ecr:GetDownloadUrlForLayer",
           "ecr:BatchGetImage",
           "ecr:PutImage",
           "ecr:InitiateLayerUpload",
           "ecr:UploadLayerPart",
           "ecr:CompleteLayerUpload"
         ],
         "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/hive-app-server"
       },
       {
         "Sid": "AppRunnerDeploy",
         "Effect": "Allow",
         "Action": ["apprunner:StartDeployment", "apprunner:DescribeService", "apprunner:ListOperations"],
         "Resource": "arn:aws:apprunner:REGION:ACCOUNT_ID:service/hive-app-server/APPRUNNER_SERVICE_ID"
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

   > If you're migrating an existing setup and already have a
   > `hive-github-deploy` (or similarly-named) IAM user with the *old*
   > Lambda-focused policy, just edit that policy in place — replace the
   > `LambdaDeploy` statement with the `ECRAuth`/`ECRPush`/`AppRunnerDeploy`
   > statements above — no need to create a second user or new access keys.

## Step 7 — GitHub repository secrets

Go to `https://github.com/danewarnick-source/agency-peace-of-mind/settings/secrets/actions`
and add each of these (**Repository secret**, not environment secret):

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from Step 6.5 |
| `AWS_SECRET_ACCESS_KEY` | from Step 6.5 |
| `AWS_REGION` | your `REGION` |
| `AWS_S3_BUCKET` | `hive-app-static` |
| `AWS_ECR_REPOSITORY` | `hive-app-server` |
| `AWS_APPRUNNER_SERVICE_ARN` | full service ARN from Step 4a.11 (leave unset for the Step 4 bootstrap run) |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | from Step 5.9 (leave unset until the distribution exists) |
| `AWS_PUBLIC_SITE_URL` | `https://<your-cloudfront-domain>` from Step 5.9 |
| `SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `VITE_SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | current value from your local `.env` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | current value from your local `.env` |
| `VITE_SUPABASE_PROJECT_ID` | `mmknqtdrefbzwfdtykza` |

This workflow reuses the existing GitHub Actions integration already on this
repo (`.github/workflows/typecheck-lint.yml`) — no new GitHub App or
permissions are needed, just these secrets.

> If you're migrating from the old Lambda setup: `AWS_LAMBDA_FUNCTION_NAME`
> is no longer used by the workflow — safe to delete that secret whenever,
> no rush.

## Step 8 — First full deploy

Once `AWS_APPRUNNER_SERVICE_ARN` and `AWS_CLOUDFRONT_DISTRIBUTION_ID` are
both set (Steps 4a and 5 complete), push any commit to `main` (or re-run the
workflow) — the `Deploy AWS (parallel target)` workflow now builds, pushes to
ECR, deploys to App Runner, and invalidates CloudFront, all in one run. Watch
it at `https://github.com/danewarnick-source/agency-peace-of-mind/actions`.

If it fails on the ECR, App Runner, or CloudFront step, it's almost always a
secret name typo or an IAM policy `Resource` ARN that doesn't match your
actual repository/service/distribution name — check the Actions log, it
names the failing AWS call directly.

## Finding your CloudFront URL

`https://console.aws.amazon.com/cloudfront/v4/home?region=REGION#/distributions`
→ click your distribution → the **Domain name** field
(`https://d1234abcd.cloudfront.net`) is your live AWS deployment. Open it in a
browser once the first full Actions run finishes to verify the app renders,
can reach Supabase, and — critically — that logging in actually loads the
dashboard instead of hanging.
