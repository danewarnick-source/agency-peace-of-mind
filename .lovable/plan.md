## Root cause

The new toast is "Nectar didn't respond in 10s — you can continue." That's the client-side `__AI_TIMEOUT__` branch firing in `runNarrativeReview`. The server function is reaching Bedrock fine (no 500s in logs anymore), but the call doesn't return inside the 10-second window.

Two things make the reviewer slow:

1. **Same model as draft, heavier workload.** Both `draftIncidentNarrative` and `reviewIncidentReport` go through `gatewayFetch` in `src/lib/ai-bedrock.server.ts`, which ALWAYS uses `BEDROCK_MODEL_ID` (the `model` field in the body is ignored — `gatewayFetch` hard-codes `getModelId()`). So both calls hit Bedrock Claude.
2. **Tool calling adds latency.** The reviewer uses Bedrock `toolConfig` with a forced tool call. Tool-mode responses on Converse are noticeably slower than plain JSON-object responses. The draft uses `response_format: { type: "json_object" }` (no tools) and finishes in time; the reviewer doesn't.

`AI_TIMEOUT_MS = 10_000` in the dialog; reviewer routinely takes longer than that, so the user sees the timeout even though Bedrock is healthy.

## Fix

Make the reviewer match the draft's transport — plain JSON object mode, no tools — and give the call a bit more headroom.

### Changes

1. **`src/lib/ai-coach.functions.ts` → `reviewIncidentReport`**
   - Drop `tools` + `tool_choice`. Send `response_format: { type: "json_object" }` and append a strict JSON instruction to the system prompt (same shape as the existing tool schema):
     ```
     {"complete": boolean, "issues": [{"field": string|null, "severity": "must_fix"|"should_add", "question": string}]}
     ```
   - Parse `choices[0].message.content` as JSON (with a `{…}` fallback regex, mirroring how `draftIncidentNarrative` recovers from stray prose).
   - Keep the existing `IncidentReviewIssue` post-filter (severity allowlist, 20-item cap, 400-char question cap).
   - Keep the fail-open contract verbatim: any error/non-2xx/bad shape returns `{ complete: true, issues: [], skipped: true, reason }`.
   - Lower `max_tokens` from 1500 → 800 (reviewer JSON is small; cuts streaming time).

2. **`src/components/incidents/incident-report-dialog.tsx`**
   - Bump `AI_TIMEOUT_MS` from `10_000` → `20_000`. JSON-mode review is faster, but 20s gives Bedrock cold-start margin without making staff wait excessively. Update the timeout toast string from "didn't respond in 10s" to "didn't respond in 20s".

### Why this works

- The (proven-fast) draft path already uses JSON-object mode through the same `gatewayFetch`/`BEDROCK_MODEL_ID` and returns inside the 10s budget. Removing tool-mode from the reviewer puts it on the same fast path.
- Fail-open is unchanged — if Bedrock still misbehaves, the user gets the "AI review skipped" badge and can continue. The 24-hour UPI clock is never blocked.
- No DB, no schema, no UI change beyond the toast string.

### Files touched

- `src/lib/ai-coach.functions.ts` — swap tool config for `response_format`, parse content, shrink max_tokens.
- `src/components/incidents/incident-report-dialog.tsx` — `AI_TIMEOUT_MS = 20_000` and timeout-toast string.
