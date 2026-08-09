# AWS login hangs on a loading screen — diagnose and fix

No Lovable setting blocks logins from AWS. Lovable and the AWS container run the same app code; what differs is where configuration, static files, and server-side keys come from. A permanent spinner after sign-in comes from one of the differences below.

## Most likely causes

1. **The browser never finishes loading the app's JavaScript.** Static files are served from S3/CloudFront while the app runs on ECS. The deploy syncs S3 with `--delete` and marks assets immutable. If CloudFront serves an older page that points at file names already deleted from S3, the app renders its loading shell and never starts. This cannot happen in the Lovable preview.
2. **Sign-in runs on the server and that server call fails on AWS.** Username/password sign-in is handled server-side and needs the private backend service key at runtime. Lovable injects it automatically; on ECS it has to be set on the task definition. Missing or wrong means the request errors or never resolves and the button stays spinning. This deploy target has a documented history of server-side call failures.
3. **"Continue with Google" cannot work on the AWS domain.** Google sign-in goes through Lovable's OAuth broker, which only serves Lovable-hosted domains. On AWS that flow stalls; username/password is the working path there.
4. **Backend URL/key missing at build time.** Those values are baked in when the AWS build runs in GitHub Actions. Empty repository secrets means the app throws before it can render past the loading state.

## What I'll do

Step 1 — Add a visible failure path so this stops being a silent spinner:
- Make the login screen surface the actual error text when the sign-in call fails or times out, instead of staying in a loading state indefinitely.
- Add a short client-side timeout on the sign-in call so a hung request becomes a readable message.
- Add a startup config check that renders a clear "backend configuration missing" message rather than a blank shell.

Step 2 — Harden the AWS deploy against the stale-asset failure:
- Stop the deploy from deleting previously referenced asset files immediately, and make sure the app's HTML is never cached long-term by CloudFront while asset files stay immutable.
- Ensure the CloudFront invalidation covers the HTML entry point on every deploy.

Step 3 — Confirm the ECS task has the required runtime environment variables (backend URL, publishable key, service key, public site URL) and document the exact list in the AWS deploy doc, so a missing one is obvious.

Step 4 — Hide or disable the Google sign-in button when the app is not running on a Lovable-hosted domain, so AWS users are steered to username/password instead of a flow that cannot complete.

Step 5 — Re-test login on the AWS URL and record the confirmed cause in the AWS deploy doc.

## Technical notes

- Files touched: `src/routes/login.tsx` (error surfacing, timeout, conditional Google button), `.github/workflows/deploy-aws.yml` (S3 sync/cache and invalidation behavior), `docs/AWS_DEPLOY.md` (required runtime env var list).
- No change to the Lovable/Cloudflare build path, `wrangler.jsonc`, or the Cloudflare server entry.
- Step 3 partly happens outside this repo, in the AWS console/task definition; I'll give exact values to set.
- I cannot reach the AWS environment from here, so the final confirmation of which cause it was needs one login attempt on the AWS URL after these changes — the error will then be readable on screen instead of a spinner.
