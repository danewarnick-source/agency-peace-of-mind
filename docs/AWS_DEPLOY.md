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
  image for **AWS ECS Fargate**.
- `.dockerignore` — keeps the image build fast; it only ever needs
  `dist-aws/server/`.
- `package.json` — added `npm run build:aws`.
- `.gitignore` — added `dist-aws`.
- `.github/workflows/deploy-aws.yml` — builds with `build:aws` on every push
  to `main`, builds+pushes a Docker image to ECR, syncs `dist-aws/client` to
  S3, deploys the new image to ECS Fargate, and invalidates CloudFront.
- `src/lib/ai-bedrock.server.ts` — Bedrock client credentials now fall back to
  the AWS SDK's default credential provider chain (which auto-resolves ECS
  task-role credentials) whenever `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  aren't set as literal env vars. No-op change for Cloudflare/Lovable, which
  still sets those explicitly.

`npm run build:aws` produces `dist-aws/server/index.mjs` — a normal,
long-running Node HTTP server (nitro's `node-server` preset) — plus
`dist-aws/client/` (static assets). It's containerized and run on
**AWS ECS Fargate**, an always-on managed container service. The default
`npm run build` is unaffected.

> **Migration note (2026-07-30):** this originally ran on **Lambda** — first
> via nitro's own `aws-lambda` preset, later via nitro's `node-server` preset
> behind the AWS Lambda Web Adapter. Both hit the same unresolved issue: every
> server-function call 500'd inside framework-internal route dispatch, only
> reproducible *inside real Lambda*. Attempted **App Runner** next, but AWS
> stopped accepting new App Runner customers on April 30, 2026. Now on **ECS
> Fargate**: same container image, always-on process, no Lambda lifecycle,
> no App Runner dependency.

## Known limitations (read before you start)

1. **ALB URL is directly reachable.** The Application Load Balancer in front
   of ECS is a public endpoint — CloudFront sits in front of it, but nothing
   stops someone hitting the ALB directly **unless you set
   `ALB_ORIGIN_VERIFY_SECRET`**.

   **Required before real PHI traffic on AWS:**

   1. Generate a long random secret (e.g. `openssl rand -hex 32`).
   2. Set it on the ECS task / Lambda as env `ALB_ORIGIN_VERIFY_SECRET`.
   3. In CloudFront, add a custom origin header on the SSR origin:
      - Header name: `x-origin-verify`
      - Value: the same secret
   4. The Nitro plugin `src/nitro-plugins/alb-origin-verify.ts` **fail-closes**
      when `ALB_ORIGIN_VERIFY_SECRET` is set: any request missing or mismatching
      `x-origin-verify` gets 403. When the env var is unset (local / Vercel-only),
      verification is skipped.

   Alternative: restrict ALB security-group inbound to CloudFront prefix lists
   only (AWS-managed CloudFront prefix list). Combining both is best.
2. **ECS Fargate runs continuously.** You're billed for the task the whole
   time it's running. At 0.25 vCPU / 512 MB this is ~$9/month; at 1 vCPU /
   2 GB ~$73/month. Scale down `desiredCount` to 0 if you need to pause.

## Step 1 — Find your region and account ID

Use the **same region as your existing Bedrock setup**: `us-east-1`.
Your **Account ID** (12-digit number) is shown at top-right in the AWS
console when you click your account name, or go to
`https://console.aws.amazon.com/billing/home#/account`.

Call these `REGION` and `ACCOUNT_ID` below.

## Step 2 — Create the S3 bucket for static assets

*(Skip if already done.)*

1. Go to `https://s3.console.aws.amazon.com/s3/home?region=us-east-1`
2. Click **Create bucket**.
3. Bucket name: `hive-app-static` (must be globally unique — if taken, use
   `hive-app-static-ACCOUNT_ID`).
4. Region: `us-east-1`.
5. **Block Public Access settings**: leave all four boxes checked (bucket
   stays private — CloudFront reaches it via Origin Access Control).
6. Leave everything else default. Click **Create bucket**.

## Step 3 — Create the ECS task role

This is the IAM role your **container** runs as at runtime — it's what lets
the app call Bedrock without embedding static credentials.

> **If you already created `hive-apprunner-instance-role`** (from the now-
> abandoned App Runner path): you can reuse it, but you must fix its trust
> policy. Open that role → **Trust relationships** → **Edit trust policy**,
> replace `tasks.apprunner.amazonaws.com` with `ecs-tasks.amazonaws.com`, and
> **Update policy**. Then rename is not possible in IAM — just use the existing
> role and substitute its name wherever you see `hive-ecs-task-role` below.
>
> Or create a new role as shown and leave the old one in place — it's harmless.

1. Go to `https://console.aws.amazon.com/iam/home#/roles`
2. Click **Create role**.
3. Trusted entity type: **Custom trust policy**. Paste:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "Service": "ecs-tasks.amazonaws.com" },
         "Action": "sts:AssumeRole"
       }
     ]
   }
   ```

4. Click **Next**. Skip managed policies — click **Next** again.
5. Role name: `hive-ecs-task-role`. Click **Create role**.
6. Open the role → **Add permissions → Create inline policy** → **JSON** tab
   → paste:

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

7. Name the policy `hive-bedrock-invoke` → **Create policy**.

## Step 4 — Create the ECR repository

*(Skip if `hive-app-server` already exists in ECR — just confirm it's there.)*

1. Go to `https://console.aws.amazon.com/ecr/repositories?region=us-east-1`
2. Click **Create repository**. Visibility: **Private**. Name: `hive-app-server`.
3. Leave everything else default. Click **Create repository**.

## Step 4a — Bootstrap the first image and create the ECS service

ECS needs an image in ECR before the service can be created. Push the first
image via CloudShell, then create the cluster, task definition, load balancer,
and service.

### Push a placeholder image (CloudShell)

1. In the AWS console top nav, click the **CloudShell** icon (`>_`).
2. Run (one command, paste the whole thing):

   ```bash
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text) && \
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin \
     "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com" && \
   docker pull node:20-slim && \
   docker tag node:20-slim \
     "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/hive-app-server:latest" && \
   docker push \
     "$ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/hive-app-server:latest"
   ```

   Wait for "pushed" to appear. Close CloudShell.

### Create the CloudWatch log group

1. Go to `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups`
2. Click **Create log group**.
3. Log group name: `/ecs/hive-app-server`. Retention: **1 month** (or whatever
   you prefer). Click **Create**.

### Create the ECS cluster

1. Go to `https://console.aws.amazon.com/ecs/v2/clusters?region=us-east-1`
2. Click **Create cluster**.
3. Cluster name: `hive-cluster`.
4. **Infrastructure**: leave **AWS Fargate (serverless)** checked.
5. Everything else default. Click **Create**.

### Create the task definition

1. Go to **Task definitions** (left sidebar) → **Create new task definition** →
   **Create new task definition with JSON**.
2. Paste the JSON below, replacing `ACCOUNT_ID` with your 12-digit account ID
   and `YOUR_SUPABASE_PUBLISHABLE_KEY` / `YOUR_BEDROCK_MODEL_ID` with real values:

   ```json
   {
     "family": "hive-app-server",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "1024",
     "memory": "2048",
     "taskRoleArn": "arn:aws:iam::ACCOUNT_ID:role/hive-ecs-task-role",
     "executionRoleArn": "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "hive-app-server",
         "image": "ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/hive-app-server:latest",
         "portMappings": [
           { "containerPort": 8080, "protocol": "tcp" }
         ],
         "environment": [
           { "name": "NODE_ENV",                 "value": "production" },
           { "name": "PORT",                     "value": "8080" },
           { "name": "AWS_REGION",               "value": "us-east-1" },
           { "name": "SUPABASE_URL",             "value": "https://mmknqtdrefbzwfdtykza.supabase.co" },
           { "name": "SUPABASE_PUBLISHABLE_KEY", "value": "YOUR_SUPABASE_PUBLISHABLE_KEY" },
           { "name": "BEDROCK_MODEL_ID",         "value": "YOUR_BEDROCK_MODEL_ID" }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group":         "/ecs/hive-app-server",
             "awslogs-region":        "us-east-1",
             "awslogs-stream-prefix": "ecs"
           }
         },
         "essential": true
       }
     ]
   }
   ```

   > **`ecsTaskExecutionRole`** is an AWS-managed role that already exists in
   > every account — it lets ECS pull images from ECR and write logs to
   > CloudWatch. If it somehow doesn't exist, ECS will offer to create it when
   > you create the service.

3. Click **Create**.

### Create security groups

You need two security groups — one for the load balancer, one for the ECS tasks.

**ALB security group:**
1. Go to `https://console.aws.amazon.com/vpc/home?region=us-east-1#securityGroups:`
2. Click **Create security group**.
3. Name: `hive-alb-sg`. VPC: **default VPC**.
4. **Inbound rules**: add one rule — Type **HTTP**, Port **80**, Source
   **Anywhere-IPv4** (`0.0.0.0/0`).
5. Click **Create security group**. Copy the **Security group ID** (e.g.
   `sg-0abc123`) — you'll need it next.

**ECS task security group:**
1. Click **Create security group** again.
2. Name: `hive-ecs-sg`. VPC: **default VPC**.
3. **Inbound rules**: add one rule — Type **Custom TCP**, Port **8080**,
   Source: **Custom** → paste the ALB security group ID (`sg-0abc123`).
   (Only the ALB can reach the tasks — not the public internet directly.)
4. Click **Create security group**. Copy this security group ID too.

### Create the Application Load Balancer

1. Go to `https://console.aws.amazon.com/ec2/home?region=us-east-1#LoadBalancers:`
2. Click **Create load balancer** → **Application Load Balancer**.
3. Name: `hive-alb`.
4. Scheme: **Internet-facing**. IP address type: **IPv4**.
5. **Network mapping**: select the **default VPC**. Check **all available
   Availability Zones** (check all the subnets).
6. **Security groups**: remove the default, add `hive-alb-sg`.
7. **Listeners and routing**: the default listener is HTTP:80. You need to
   create a target group — click **Create target group** (opens a new tab):
   - Target type: **IP addresses**.
   - Target group name: `hive-tg`.
   - Protocol: **HTTP**. Port: **8080**.
   - Health check path: `/` (default, fine).
   - Click **Next** → **Create target group** (don't add any targets — ECS
     registers them automatically).
8. Back in the ALB tab: refresh the target group dropdown → select `hive-tg`.
9. Click **Create load balancer**. Copy the **DNS name**
   (e.g. `hive-alb-1234567890.us-east-1.elb.amazonaws.com`) — this becomes
   the CloudFront SSR origin in Step 5.

### Create the ECS service

1. Go to `https://console.aws.amazon.com/ecs/v2/clusters/hive-cluster/services?region=us-east-1`
2. Click **Create**.
3. **Launch type**: **FARGATE**.
4. **Task definition family**: `hive-app-server`. Revision: **LATEST**.
5. **Service name**: `hive-app-server`.
6. **Desired tasks**: `1`.
7. **Networking**:
   - VPC: **default VPC**.
   - Subnets: select **all** available subnets.
   - Security group: remove the default, add `hive-ecs-sg`.
   - **Public IP**: **Turned on** (tasks need outbound internet to reach
     Supabase and Bedrock).
8. **Load balancing**:
   - Load balancer type: **Application Load Balancer**.
   - Choose **Use an existing load balancer** → select `hive-alb`.
   - Container: `hive-app-server 8080:8080`.
   - Listener: **Use an existing listener** → `80:HTTP`.
   - Target group: **Use an existing target group** → `hive-tg`.
9. Click **Create**. Wait for the service status to reach **Running** (a few
   minutes). Check the **Tasks** tab — the task should show **RUNNING**.

The ALB DNS name from above (`hive-alb-....elb.amazonaws.com`) is now your
SSR origin for CloudFront. Also note the **cluster name** (`hive-cluster`) and
**service name** (`hive-app-server`) — you'll need both for GitHub secrets.

## Step 5 — Create the CloudFront distribution

1. Go to `https://console.aws.amazon.com/cloudfront/v4/home?region=us-east-1#/distributions`
2. Click **Create distribution**.
3. **Origin 1 (static assets)**:
   - Origin domain: select your `hive-app-static` S3 bucket from the dropdown.
   - Origin access: **Origin access control settings (recommended)** → click
     **Create control setting** → accept defaults → **Create**.
   - Leave the rest default.
4. Click **Add origin** for **Origin 2 (SSR)**:
   - Origin domain: paste the ALB DNS name from Step 4a
     (`hive-alb-1234567890.us-east-1.elb.amazonaws.com` — no `https://`).
   - Protocol: **HTTP only** (ALB listener is HTTP:80; CloudFront handles
     HTTPS for your visitors).

   > **If there's no "Add origin" option**: finish creating with just Origin 1,
   > then add Origin 2 afterward: distribution → **Origins** tab →
   > **Create origin** → fill in the ALB domain + **HTTP only** → Save.
   > Then **Behaviors** tab → **Default (\*)** → **Edit** → set its origin to
   > the SSR origin you just created + the settings from step 5.5 → Save.

5. **Default cache behavior** (the catch-all `*` behavior):
   - Origin: the **ALB/SSR** origin.
   - Viewer protocol policy: **Redirect HTTP to HTTPS**.
   - Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
     (TanStack Start server functions use POST).
   - Cache policy: **CachingDisabled** (SSR responses are per-request).
   - Origin request policy: **AllViewer** (forwards headers/cookies/query
     strings the app needs).
6. After creation, open the distribution → **Behaviors** tab → **Create
   behavior**, once for each path pattern below, all pointing at the
   **S3 static-assets origin**, cache policy **CachingOptimized**:
   - `/assets/*`
   - `*.ico`
   - `*.png`
   - `*.webmanifest`
   - `/sw.js`
7. Back on the S3 bucket, update the bucket policy for Origin Access Control:
   distribution → **Origins** tab → click the S3 origin → **Copy policy**,
   then S3 console → bucket → **Permissions → Bucket policy → Edit** → paste
   → **Save changes**. (Template if not auto-prompted — fill in your values:

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
8. Wait for distribution status **Deployed** (5–15 min). Copy:
   - **Domain name** (`d1234abcd.cloudfront.net`) — your app URL.
   - **Distribution ID** — needed in GitHub secrets.

## Step 6 — IAM user for GitHub Actions

> **If you already have `hive-github-deploy`** from the Lambda setup: open
> that user → **Permissions** tab → click your existing policy → **Edit** →
> **JSON** tab, and replace the entire policy with the JSON below. No new user
> or new access keys needed.

1. Go to `https://console.aws.amazon.com/iam/home#/users`
2. Click **Create user**. Name: `hive-github-deploy`. **Do not** give console
   access. Click **Next**.
3. **Attach policies directly → Create policy** (new tab), **JSON** tab, paste
   (replace `REGION`, `ACCOUNT_ID`, `DISTRIBUTION_ID`):

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
         "Sid": "ECSDeploy",
         "Effect": "Allow",
         "Action": [
           "ecs:DescribeTaskDefinition",
           "ecs:RegisterTaskDefinition",
           "ecs:UpdateService",
           "ecs:DescribeServices"
         ],
         "Resource": "*"
       },
       {
         "Sid": "PassTaskRoles",
         "Effect": "Allow",
         "Action": "iam:PassRole",
         "Resource": [
           "arn:aws:iam::ACCOUNT_ID:role/hive-ecs-task-role",
           "arn:aws:iam::ACCOUNT_ID:role/ecsTaskExecutionRole"
         ]
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

   Name it `hive-github-deploy-policy` → **Create policy**. Back in the first
   tab, refresh → check `hive-github-deploy-policy` → **Next** → **Create user**.
4. Open the new user → **Security credentials** → **Access keys → Create access
   key** → **Third-party service** → acknowledge → **Create access key**.
5. Copy the **Access key ID** and **Secret access key** — shown only once.

## Step 7 — GitHub repository secrets

Go to `https://github.com/danewarnick-source/agency-peace-of-mind/settings/secrets/actions`

Add (or update) each **Repository secret**:

| Secret name | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | from Step 6.5 |
| `AWS_SECRET_ACCESS_KEY` | from Step 6.5 |
| `AWS_REGION` | `us-east-1` |
| `AWS_S3_BUCKET` | `hive-app-static` |
| `AWS_ECR_REPOSITORY` | `hive-app-server` |
| `AWS_ECS_CLUSTER` | `hive-cluster` |
| `AWS_ECS_SERVICE` | `hive-app-server` |
| `AWS_CLOUDFRONT_DISTRIBUTION_ID` | from Step 5.8 (leave unset until distribution exists) |
| `AWS_PUBLIC_SITE_URL` | `https://d1234abcd.cloudfront.net` from Step 5.8 |
| `SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `VITE_SUPABASE_URL` | `https://mmknqtdrefbzwfdtykza.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | your publishable/anon key |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same |
| `VITE_SUPABASE_PROJECT_ID` | `mmknqtdrefbzwfdtykza` |

> **Secrets no longer needed** (safe to delete): `AWS_LAMBDA_FUNCTION_NAME`,
> `AWS_APPRUNNER_SERVICE_ARN`.

## Step 8 — First full deploy

Once `AWS_ECS_CLUSTER`, `AWS_ECS_SERVICE`, and `AWS_CLOUDFRONT_DISTRIBUTION_ID`
are all set, push any commit to `main` (or re-run the workflow) — the
`Deploy AWS (parallel target)` workflow builds, pushes to ECR, registers a new
ECS task definition, updates the ECS service, waits for it to stabilize, and
invalidates CloudFront. Watch it at:
`https://github.com/danewarnick-source/agency-peace-of-mind/actions`

After it passes, open your CloudFront URL in a browser and verify the landing
page loads, login works, and the dashboard renders.

## Viewing logs

CloudWatch → **Log groups** → `/ecs/hive-app-server` → click the most recent
log stream. This is the equivalent of Lambda's CloudWatch logs — all
`console.log`/`console.error` output from the container appears here.
