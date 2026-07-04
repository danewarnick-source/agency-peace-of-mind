## The real bottleneck

AWS quotas (not adjustable at our tier):
- **10 requests/minute** on cross-region + global cross-region inference for Sonnet 4.6 → 1 call every 6 s, hard cap.
- **5.4M invocation tokens/day** → roughly 150–200 real-world calls/day, shared across all NECTAR features.
- Everything else (TPM, batch sizes) is far above what we'd hit.

The current pipeline is designed as if the limits are elastic: concurrency 2, recursive splits (1 chunk can spawn up to 16 sub-calls), 3 transient retries per call, all chunks re-run from scratch on any transient. On a 5-chunk doc that easily balloons to 30–50 requests, which trips the 10 RPM cap, which fires the transient path, which restarts chunks, which spends more requests. That's the loop.

## Design goal

**Every requirements draft = exactly N requests where N = number of chunks. No retries that spawn extra requests unless truly necessary. No concurrency. No recursive splits.**

## Fix plan (in priority order)

### 1. Kill recursive splitting entirely
`extractChunkWithRetry` currently splits a failing chunk in half up to depth 4 → up to 16 calls per chunk. Replace with:
- On `finish_reason: "length"` (real truncation): retry the SAME chunk ONCE with `max_tokens` doubled (16k → 32k → give up). No text splitting.
- On parse error: run JSON repair locally (strip ```` ``` ```` fences, extract first balanced `{...}`). If repair fails, record failure and move on. Zero extra requests.
- On transient/429: wait per the rate limiter (see §3), retry ONCE, then record failure and move on.

Net: worst case per chunk = 2 requests, best case = 1.

### 2. Right-size chunks so 1 chunk = 1 successful call
- Chunk window: 60k → **40k chars** (~10–12k input tokens).
- `max_tokens`: 8192 → **24000** (Sonnet 4.6 supports 64k output; 24k gives huge margin for dense reg text).
- Overlap: keep at 4k.
- Result: a typical 200k-char reg PDF becomes 5–6 chunks, each finishing in one call.

### 3. Serialize with a token-bucket rate limiter
Replace `TICK_CONCURRENCY = 2` + `LARGE_DOC_INTER_CALL_PAUSE_MS = 1500` with:
- Concurrency = **1** (always).
- A shared token bucket: **8 requests per rolling 60 s window** (80% of the 10 RPM cap — leaves headroom for other NECTAR features and the retry in §1).
- Bucket state lives in a small table (or a `nectar_rate_state` row) keyed by model id, so multiple tabs / the cron tick / other server fns all share the same budget. In-memory won't work — Workers are stateless.
- Before each call: `await acquireToken()`. If bucket is empty, sleep until the next slot; do NOT throw.

### 4. Preemptive daily-token guard
- Track daily invocation tokens (sum of `usage.input_tokens + usage.output_tokens` from Bedrock responses) in the same `nectar_rate_state` row, resetting at UTC midnight.
- Before starting a new draft, estimate `chunks × 30k` tokens. If that would exceed the remaining daily budget, refuse the job with a clear message ("Bedrock daily token budget nearly exhausted, resets at HH:MM UTC — try again then") instead of starting and stalling halfway.

### 5. Compact JSON output prompt
Cuts output tokens 30–50%, which directly extends daily capacity:
- System prompt addendum: "Return ONLY the raw JSON object. No markdown fences. No prose. No pretty-printing — single line, no unnecessary whitespace. Omit optional fields when null."
- Keep the Zod schema strict on parse so we still validate.

### 6. Local JSON repair (no extra request)
In `extractOnce` before `JSON.parse`:
- Strip ```` ```json ```` / ```` ``` ```` fences from start/end.
- Trim any preamble before the first `{` and any suffix after the matching `}` (balanced-brace scan).
- Only throw `ChunkParseError` if repair still fails.
- Distinguish `TruncationError` (finish_reason=length) from `ParseError` so §1 can react differently.

### 7. Hard per-chunk attempt cap + always advance
`processOneChunk` tracks attempts per chunk (persisted as `chunk_attempts: number[]` on the job row). After **2** full-chunk attempts (whether transient, truncation, or parse), force-persist the chunk with a `failures: ["chunk N failed after 2 attempts: <last error>"]` note and advance `processed_chunks`. Guarantees the job reaches `total_chunks` in bounded time — no more 12-hour "reading section 2".

### 8. Finalize job transition
After each `persistChunkResult`, if `processed_chunks === total_chunks`, transition status to `completed` (or `completed_with_failures` if any `chunk_failures`). Verify this exists; add if missing.

## Expected behavior after fix

| Doc size | Chunks | Requests (best) | Requests (worst) | Wall-clock (best) |
| --- | --- | --- | --- | --- |
| 100k chars | 3 | 3 | 6 | ~20 s |
| 200k chars | 6 | 6 | 12 | ~45 s |
| 400k chars | 11 | 11 | 22 | ~90 s |

At 8 RPM effective rate, a 200k-char doc finishes in under a minute. The old pipeline's stuck job burned 22 requests and produced 0 items — new pipeline caps that same doc at 12 requests and always finishes.

## Files touched

- `src/lib/authoritative-sources.server.ts` — JSON repair, error taxonomy (Truncation vs Parse), remove recursive split, single truncation retry with bumped `max_tokens`, chunk window 40k, compact-JSON prompt.
- `src/lib/nectar-draft-tick.server.ts` — concurrency 1, remove inter-call pause (rate limiter owns it), per-chunk attempt cap, always-advance guarantee, finalize transition, token-bucket integration.
- **New**: `src/lib/nectar-rate-limit.server.ts` — token-bucket (8 req / 60s) and daily-token counter, backed by a small DB row.
- **New migration**: `nectar_rate_state` table (one row per model id: `window_start`, `window_count`, `day_start`, `day_tokens_used`) + GRANTs + service_role-only policy.
- No app UI changes required. Optional follow-up: show remaining daily budget on the Authoritative Sources screen.

## Not included (intentionally)

- No model swap — Sonnet 4.5/4.6 is correct for this workload; the constraint is quota, not quality.
- No batch-inference migration — the batch API is 100-record minimum with hours-long turnaround; wrong tool for interactive drafts.
- No provisioned throughput — that's a paid AWS commitment, not something we solve in code.
