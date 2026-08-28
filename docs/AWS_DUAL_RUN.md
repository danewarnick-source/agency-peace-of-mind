# AWS dual-run (Cognito + RDS + S3)

Hive can run on **two stacks at once**:

| Where | Auth | Database | Files |
|---|---|---|---|
| **Vercel production (keep this)** | Supabase Auth | Supabase Postgres | Supabase Storage |
| **AWS ECS** (CloudFront → ALB → ECS) | Cognito, **only if you set the env vars below** | RDS, **only if you set `DATABASE_URL`** | S3, **only if you set `S3_BUCKET`** |

If the AWS variables are **not** set, the app behaves exactly as it does today (Supabase). You do **not** need to merge this and cut over. Prove AWS first, keep Vercel as the live site, and **do not delete the Supabase project** — it is the backup.

True North Supports billed/comped behavior, punch pad/GPS, and product scope are unchanged.

## What to leave on Vercel

Leave these as they already are. Do **not** add the Cognito / RDS / S3 variables on Vercel.

- `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` / `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE` / `SUPABASE_SERVICE_ROLE_KEY`

Default: `AUTH_PROVIDER` unset (treated as `supabase`).

## Exact env vars to set on ECS (when you are ready to prove AWS)

Set these on the **ECS task definition** (the running container), not in the Vite build secrets.

### Auth (Cognito)

| Name | Required | Example / notes |
|---|---|---|
| `AUTH_PROVIDER` | yes, to turn Cognito on | `cognito` (anything else, or unset = `supabase`) |
| `COGNITO_USER_POOL_ID` | yes | `us-east-1_XXXXXXXXX` |
| `COGNITO_CLIENT_ID` | yes | app client id |
| `COGNITO_REGION` | no | `us-east-1` (default) |
| `COGNITO_CLIENT_SECRET` | only if the app client has a secret | HMAC secret hash is computed on the server |

App client must allow **`USER_PASSWORD_AUTH`**. Existing emails/passwords keep working via the User Migration Lambda (built separately). That lambda verifies the bcrypt hash from the copied `auth.users` table and stores the original Supabase user UUID as **`custom:supabase_id`**.

The app uses **`custom:supabase_id` as `profiles.id` / `auth.uid()`** for every foreign key and RLS check. Cognito `sub` is **not** the app user id. If the custom attribute is missing, the app looks up `profiles` by email.

The app **does not force-reset passwords** on login. `must_change_password` on the profile is unchanged (user already signed in, then sets a new password).

### Database (RDS)

| Name | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes, to use RDS | Postgres URL. Alias: `AWS_DATABASE_URL` |
| | | Use a **pooler** (RDS Proxy or PgBouncer in transaction mode). The app opens a small pool (`max` 8) and does not use session `SET` / `LISTEN`. |

When `DATABASE_URL` is set, server-side queries that used the Supabase **service role** go to this Postgres connection (trusted, same as service role). RLS on RDS is incomplete, so org checks in server functions still run in app code.

When `AUTH_PROVIDER=cognito`, browser `supabase.from()` / `.rpc()` calls are sent to `/api/aws/db` (session required) so we do **not** rewrite every screen. That endpoint uses RDS if `DATABASE_URL` is set, otherwise the existing Supabase service role (hybrid).

### Storage (S3)

| Name | Required | Notes |
|---|---|---|
| `S3_BUCKET` | yes, to use S3 | Application documents bucket (not the CloudFront static-assets bucket) |
| `S3_REGION` | no | `us-east-1` (falls back to `AWS_REGION`) |

Object keys stay `{supabase-bucket-name}/{path}` inside `S3_BUCKET` (same paths as today). Unset `S3_BUCKET` → `supabase.storage` as usual.

The ECS **task role** needs `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on `arn:aws:s3:::YOUR_BUCKET/*`, plus Cognito admin APIs if you create staff from Hive (`cognito-idp:AdminCreateUser`, `AdminSetUserPassword`, `AdminDeleteUser`, `AdminUpdateUserAttributes`). `InitiateAuth` / `GetUser` / `ForgotPassword` work with the client id (and secret) as env vars.

Also keep setting (from `docs/AWS_DEPLOY.md`) if you already use them:

- `ALB_ORIGIN_VERIFY_SECRET`
- `AWS_REGION=us-east-1`
- Bedrock: task-role `bedrock:InvokeModel` (no static keys required on ECS)

You may still put Supabase URL/keys on ECS as a **backup hybrid**. They are not required once Cognito + `DATABASE_URL` + `S3_BUCKET` are proven. **Do not delete the Supabase project.**

## What to keep off Vercel

Do **not** set `AUTH_PROVIDER=cognito`, `DATABASE_URL` / `AWS_DATABASE_URL`, `COGNITO_*`, or `S3_BUCKET` on Vercel production. That is how Vercel stays on Supabase.

## How login works on AWS

1. User types the same email/username + password as today.
2. If `AUTH_PROVIDER=cognito`, the server calls Cognito `USER_PASSWORD_AUTH` (SRP is not required if that flow is enabled on the app client).
3. Cognito may invoke the User Migration Lambda on first sign-in (infra, not this repo).
4. Hive stores a session cookie (`hive.aws_session`) and the browser session. Server functions still send `Authorization: Bearer …`.
5. App user id = `custom:supabase_id` (else `profiles.email` lookup).

Forgot-password on Cognito emails a **code** (Cognito), not the old Supabase magic link. Users who are already signed in and must change password still use `/reset-password` (admin set-password on Cognito; original password is not overwritten at login).

Realtime (notification badge live updates) is a no-op on the AWS data path; the 30s poll still works.

## Prove it without merging to production

1. Deploy this branch to ECS only (or a separate ECS service).
2. Leave Vercel on `main` with no AWS vars.
3. Set the ECS vars above, confirm login + admin/staff dashboard + punch pad.
4. Only then consider switching DNS. Keep Supabase until AWS has been stable.

`GET /api/public/runtime-config` shows which gates are on (`authProvider`, `databaseUrlSet`, `s3BucketSet`) without exposing secrets.

## Rebuild the ECS image (do not replace the live :15 task until it stays up)

The container runs Nitro's `node-server` bundle: `CMD ["node", "index.mjs"]` from `dist-aws/server/` (see `deploy/aws/Dockerfile`). `AUTH_PROVIDER=cognito` is a **runtime** env on the task — it is not baked into the image. After this branch, rebuild and push a **new tag**, then start a **new task definition revision**. Keep `hive-app-server:15` as the service task until the new revision stays `RUNNING`.

From this branch (repo root):

```bash
npm ci
npm run build:aws

ACCOUNT=684707794522
REGION=us-east-1
REPO=hive-app-server
SHA=$(git rev-parse HEAD)
IMAGE="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/$REPO"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

docker build -f deploy/aws/Dockerfile -t "$IMAGE:$SHA" .
docker push "$IMAGE:$SHA"
```

Register a new task definition that is a copy of the Cognito revision (`hive-app-server:63` env), but with image `$IMAGE:$SHA`. Do **not** `update-service` onto the live `hive-app-server-service-o5c33ah8` until that revision's task stays running (CloudWatch `/ecs/hive-app-server` should show the Node process listening, not `defineNitroPlugin is not defined`).

Alternatively: GitHub → Actions → **Deploy AWS (parallel target)** → **Run workflow** → this branch. That workflow builds, pushes `$GITHUB_SHA`, and **will update the live ECS service** if `AWS_ECS_CLUSTER` / `AWS_ECS_SERVICE` secrets are set — only use that when you are ready to point the live service at the new image.
