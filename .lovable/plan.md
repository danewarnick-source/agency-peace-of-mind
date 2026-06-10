# Fix: "http2.connect is not implemented" on Bedrock calls

## Root cause
The AWS SDK's default HTTP transport uses Node's `http2` module. Cloudflare Workers (workerd) stubs `http2` but doesn't implement `http2.connect`, so every Bedrock call throws before leaving the Worker. The model ID change was fine — Bedrock is just never reached.

## Change
In `src/lib/ai-bedrock.server.ts`, construct `BedrockRuntimeClient` with a fetch-based request handler instead of the default Node http2 handler:

```ts
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

new BedrockRuntimeClient({
  region,
  credentials: { accessKeyId, secretAccessKey },
  requestHandler: new FetchHttpHandler(),
});
```

`@smithy/fetch-http-handler` is already present under `node_modules` as a transitive dep, so no install is needed. If module resolution complains, add it explicitly with `bun add @smithy/fetch-http-handler`.

No changes to the Deno edge mirror (`supabase/functions/_shared/bedrock-fetch.ts`) — Deno's AWS SDK already uses fetch.

No UI, model behavior, prompt, or call-site changes. Loud-failure contract (401 / 429 / clear errors) is preserved.

## Verify
Click **Draft it** on the Scheduler with a real prompt. Expect either a real proposal or a clear Bedrock-side error — not the `http2.connect` message.
