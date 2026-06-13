## Root cause

The "Nectar review unavailable" toast is the client's fail-open path firing because the `review-incident-report` Supabase edge function is returning `skipped: true`. Edge logs show every call crashing inside the Bedrock shim:

```
Bedrock Error (500) for model global.anthropic.claude-sonnet-4-6 in us-east-1:
Not implemented: Http2Session.settings
```

This is a Deno runtime limitation — the AWS SDK's HTTP/2 client isn't supported in Supabase Edge Functions. The draft path works because it runs as a **TanStack server function** (`draftIncidentNarrative` in `src/lib/ai-coach.functions.ts`) using the **Node-side** `gatewayFetch` from `src/lib/ai-bedrock.server.ts`, where HTTP/2 works fine. The review path is the only Nectar surface still on the broken Deno/Bedrock shim.

## Fix

Move the reviewer off the edge function and onto the same TanStack server-function + Node Bedrock path the draft uses. No UI/UX change, no DB change — only the transport.

### Changes

1. **New server function `reviewIncidentReport`** in `src/lib/ai-coach.functions.ts`
   - Pattern matches `draftIncidentNarrative` (createServerFn POST + `requireSupabaseAuth` + `inputValidator` for `{ draft }`).
   - Reuses the existing `SYSTEM_PROMPT`, `return_incident_review` tool schema, and 30k-char truncation from `supabase/functions/review-incident-report/index.ts` — copied verbatim into the server function.
   - Calls `gatewayFetch` from `@/lib/ai-bedrock.server` (Node side, HTTP/2 works).
   - Preserves fail-open contract: returns `{ complete: true, issues: [], skipped: true, reason }` on any error/non-2xx/bad shape, exactly like the edge function does today — the client wrapper already expects that shape.

2. **Client swap** in `src/components/incidents/incident-report-dialog.tsx`
   - In `runNarrativeReview` (~line 695) and `runAiReview` (~line 745) and the submit-time reviewer (~line 810): replace
     `supabase.functions.invoke("review-incident-report", { body: { draft } })`
     with a `useServerFn(reviewIncidentReport)` call (kept inside `withAiTimeout`).
   - Result shape is identical, so the existing `{ data, error }` branches stay; we adapt the wrapper to return the same `{ data, error }` shape the call sites consume.

3. **Edge function deprecation**
   - Delete `supabase/functions/review-incident-report/` since nothing else calls it. (Removes a dead broken path; prevents future regressions.)

### Files touched

- `src/lib/ai-coach.functions.ts` — add `reviewIncidentReport` server function (~60 lines, mirrors `draftIncidentNarrative`).
- `src/components/incidents/incident-report-dialog.tsx` — 3 call-site swaps, no logic changes.
- `supabase/functions/review-incident-report/` — delete.

### Why this works / risk

- Same Bedrock model, same prompt, same tool schema, same fail-open contract → reviewer behavior is unchanged when AI is healthy.
- Node runtime (Cloudflare Worker with nodejs_compat) supports HTTP/2 in the AWS SDK — the draft path proves this in production today.
- Fail-open semantics preserved: if Bedrock is still flaky for some other reason, the user still gets the "AI review skipped" badge and can continue (24-hour UPI clock rule).
