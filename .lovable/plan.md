# Why login hangs on the AWS deployment

Short answer: there is no Lovable setting that "blocks" logging in from AWS. The Lovable preview and the AWS container run the *same* app code, but they get their configuration, static files, and server-side keys from completely different places. A permanent loading screen after sign-in is almost always one of those three differences — not an auth rule.

## The realistic causes, in order of likelihood

1. **The browser never finishes loading the app's JavaScript.**
   The AWS deploy serves static files from S3/CloudFront and the app itself from ECS. The deploy syncs S3 with `--delete` and marks assets `immutable`, while `index.html` is served fresh. If CloudFront hands back an HTML page that points at file names from an older build (or the app HTML is cached), those files no longer exist in S3 and the page renders its loading shell forever. This looks exactly like "spinner that never goes away" and would not happen in the Lovable preview.

2. **Sign-in itself runs on the server and that server call fails on AWS.**
   The username/password sign-in is handled by a server-side function that needs the private backend service key at runtime. In Lovable that key is injected automatically; on ECS it must be present as a task environment variable. If it's missing or wrong, the call errors or never resolves and the button stays in its loading state. This target has a documented history of server-function failures on AWS.

3. **"Continue with Google" cannot work on the AWS domain.**
   Google sign-in goes through Lovable's OAuth broker, which only handles Lovable-hosted domains. On an AWS/CloudFront domain that flow can stall. Email/username + password is the path that should work there.

4. **Backend config missing at build time.**
   The browser-side backend URL/key are baked in when the AWS build runs in GitHub Actions. If those repository secrets are empty, the app throws before it can render anything past the loading state.

## Plan: diagnose first, then fix the confirmed cause

Step 1 — Collect evidence from the AWS site (no code changes):
- Open the AWS URL, open the browser console and network tab, attempt a login, and capture: any red console errors, any 404s on `/assets/...` files, and the response status of the sign-in request.
- Pull the ECS/CloudWatch log lines for that same moment (the app already logs full error chains from its error middleware).

Step 2 — Match the evidence to one of the four causes above and apply the matching fix:
- 404s on asset files → fix caching/invalidation for the app HTML and stop deleting still-referenced assets on deploy.
- Sign-in request 500 → add/repair the missing runtime environment variables on the ECS task definition, then redeploy.
- Google button only → route AWS users to username/password sign-in, or hide the Google button on non-Lovable domains.
- App throws immediately with a config message → set the missing build-time repository secrets and rebuild.

Step 3 — Re-test login on AWS and confirm the dashboard loads, then note the resolved cause in the AWS deploy doc.

## Notes

- No changes to the Lovable/Cloudflare build path are involved; everything here is on the parallel AWS target.
- I can't reach the AWS environment from here, so Step 1 needs either you running it and pasting the console/network output, or the CloudWatch log excerpt.
