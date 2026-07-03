# Fix Draft Requirements: correctness first, speed second (Bedrock)

All document-reading traffic already runs on AWS Bedrock via `gatewayFetch` in `src/lib/ai-bedrock.server.ts` (BAA-covered, in your AWS account). The `"google/..."` string in the code is dead weight the shim ignores. Two phases below — do not start Phase 2 until Phase 1 is verified.

---

## Phase 1 — Stop the parse failures (ship + verify before touching speed)

### Root cause
In `extractOnce` (src/lib/authoritative-sources.server.ts):
- Chunks are ~30k chars, output cap defaults to 4096 tokens in `gatewayFetch`. Dense SOW prose → JSON response truncated mid-object → `JSON.parse` throws `ChunkParseError("invalid/truncated JSON")` → toast "8 of 10 sections failed to parse".
- The half-split retry runs on ~15k halves that also truncate, so failures compound.
- We can't tell truncation from real schema failure today, so retries misfire.

### Changes

1. **Right-size chunks** — `chunkDocumentRanges` defaults: `windowSize` 30_000 → **12_000**, `overlap` 1_500 → **800**, `maxChunks` 40 → **80**. A 12k window fits comfortably under the response cap for contract text.
2. **Explicit output budget** — in `extractOnce`, pass `max_tokens: 8192` so `inferenceConfig.maxTokens` in the Bedrock shim is generous even on unusually dense chunks.
3. **Detect truncation properly** — in `src/lib/ai-bedrock.server.ts`, capture `out.stopReason` from the Bedrock response and expose it on the shim's OpenAI-shaped return as `finish_reason` (`"length"` when truncated, `"stop"` normally). In `extractOnce`, when `finish_reason === "length"`, throw `ChunkParseError("output truncated")` so the retry-halves path fires deliberately instead of by guess.
4. **Surface the real reason in the UI** — in `src/components/pages/authoritative-sources-page.tsx`, when `chunk_failures` is non-empty include the first failure string in the toast ("…failed: output truncated (PART 3)"), not just the count.
5. **Kill the misleading model string** — replace `model: "google/gemini-2.5-flash"` in `extractOnce` and its sibling `EXPLAIN` call with `model: "bedrock"`. The shim ignores the field, but leaving Google's name in the source is what caused today's compliance scare. Do the same one-line swap on the other `gatewayFetch` call sites listed by grep (`src/lib/*.functions.ts`, `src/lib/*.server.ts`) — cosmetic, zero behavior change.

### Files
- `src/lib/ai-bedrock.server.ts` — expose Bedrock `stopReason` as `finish_reason`.
- `src/lib/authoritative-sources.server.ts` — chunk sizing, `max_tokens`, truncation detection, drop `"google/..."` string.
- `src/components/pages/authoritative-sources-page.tsx` — toast includes first failure string.
- Other `gatewayFetch` callers — cosmetic `model` string swap only.

### Verify (before Phase 2)
Re-run Draft Requirements on the same SOW. Success = `chunk_failures` is empty (or a single specific message, not 8/10). Resumability unchanged: kill tab mid-run, reopen, confirm no re-charging of processed chunks. If any chunk still errors, read the specific failure string from the toast and address that before moving on.

No migration, no provider change, no schema change, no concurrency change. Wall time may improve as a side effect (fewer truncations = fewer retries) but that isn't the goal here.

---

## Phase 2 — Speed (only after Phase 1 is verified green)

Once we've confirmed drafts complete without parse failures, cut wall time from 8–10 min to ~2 min:

1. **Bedrock model tuning (env only, no code)** — recommend `BEDROCK_MODEL_ID` = fast Claude Haiku profile for chunk extraction. Add optional `BEDROCK_HEAVY_MODEL_ID` env; when set, the retry-halves path uses it, otherwise falls back to `BEDROCK_MODEL_ID`. Pure opt-in, still 100% Bedrock under your BAA.
2. **Concurrency** — `TICK_CONCURRENCY` in `src/lib/nectar-draft-tick.server.ts` 3 → **6**. Chunks are smaller after Phase 1 so this is safe; `processed_indices` idempotency guard already prevents double-processing.
3. **Per-chunk log line** — `console.info` in `runDraftTick` with `{chunkIndex, durationMs, itemCount, failure}` so we have server-side visibility (AI Gateway logs won't show anything — traffic is on Bedrock).

### Verify
End-to-end ≤ ~2 min on the same SOW at concurrency 6, still zero `chunk_failures`.
