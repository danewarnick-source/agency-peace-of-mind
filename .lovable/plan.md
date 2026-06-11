## Problem

The http2 transport bug is fixed — we are now actually reaching AWS Bedrock, and AWS is returning a **real 403** (`AccessDeniedException`, `UnrecognizedClientException`, or `InvalidSignatureException`). Our adapter currently collapses all of those into one generic message: *"AWS Bedrock rejected the credentials or denied access to the configured model."* That message is true but useless — it does not tell us which of the three root causes is actually firing:

1. **Model access not granted** in the AWS Bedrock console for `us.anthropic.claude-sonnet-4-6` (Anthropic Sonnet 4.x family must be explicitly enabled per account/region).
2. **Wrong region** — `us.*` is a cross-region inference profile and only resolves in US Bedrock regions (`us-east-1`, `us-east-2`, `us-west-2`). Any other `AWS_REGION` value returns 403.
3. **Bad credentials / missing IAM permission** — `AWS_ACCESS_KEY_ID` doesn't belong to the same account where model access was granted, or its IAM policy is missing `bedrock:InvokeModel`.

Guessing wrong wastes a round-trip. The fix is to expose AWS's own error name + message in our thrown error so the next "Draft it" click tells us exactly which one it is.

## Plan

### 1. Improve error reporting in `src/lib/ai-bedrock.server.ts`

In the catch block around the `InvokeModelCommand` call, read the AWS SDK error fields that are already present on the thrown object:

- `err.name` — e.g. `AccessDeniedException`, `ValidationException`, `ResourceNotFoundException`, `ThrottlingException`, `UnrecognizedClientException`, `InvalidSignatureException`.
- `err.$metadata?.httpStatusCode` — 400/403/404/429.
- `err.message` — AWS's human-readable detail (often includes the offending model ID or "You don't have access to the model with the specified model ID").

Throw a new `Error` whose message is shaped like:

```
Bedrock {name} ({httpStatusCode}) for model {modelId} in {region}: {message}
```

Keep the existing buckets (401/403 → credentials/access; 429 → throttle; empty body → empty) but include the raw AWS name + message inside each bucket's thrown error. Still loud-fail — no silent fallback.

Also log once to the server console (`console.error`) with the same string, so it shows up in Server Logs even if the UI only renders a short toast.

### 2. Mirror the same change in `supabase/functions/_shared/bedrock-fetch.ts`

The Deno edge mirror parses the Bedrock REST response itself. When the response status is non-2xx, read the JSON body's `__type` and `message` (Bedrock's standard error envelope), and throw a string in the same `Bedrock {type} ({status}) for model {modelId} in {region}: {message}` shape. This keeps the two adapters symmetrical.

### 3. No other changes

- No prompt, model, call-site, or UI changes.
- No new dependencies.
- The 19 server-function files and the 2 edge functions that already route through these adapters automatically inherit the better error.

## What you'll see after this ships

Click **Draft it** once more. The red toast (and Server Logs) will then say one of, e.g.:

- `Bedrock AccessDeniedException (403) for model us.anthropic.claude-sonnet-4-6 in us-east-1: You don't have access to the model with the specified model ID.` → enable model access in the Bedrock console (Model access → request access for Anthropic Claude Sonnet 4.x).
- `Bedrock ValidationException (400) ... inference profile ... not found in region eu-west-1` → change `AWS_REGION` secret to `us-east-1` / `us-east-2` / `us-west-2`.
- `Bedrock UnrecognizedClientException (403) ... The security token included in the request is invalid` → rotate / fix `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` secrets.
- `Bedrock ResourceNotFoundException (404) ... model ... not found` → the model ID string itself is wrong; update the `BEDROCK_MODEL_ID` secret to a real ID (e.g. `us.anthropic.claude-sonnet-4-5-20250929-v1:0`).

Once we see which of those it is, the fix is a single secret update (no code change) — and I can guide you through it in one message.

## Files touched

- `src/lib/ai-bedrock.server.ts` — richer error in catch block
- `supabase/functions/_shared/bedrock-fetch.ts` — same shape for Deno edge functions

## Technical notes

- AWS SDK for JS v3 always attaches `$metadata` and `name` to thrown service errors — no extra parsing library needed.
- The `us.` prefix on a Bedrock model ID denotes a cross-region inference profile; it is not a typo and does not need to be stripped.
- We are not changing the **loud-failure contract** — every bucket still throws; nothing falls back to fake data or another provider.
