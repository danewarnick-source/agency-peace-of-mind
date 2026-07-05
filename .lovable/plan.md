# Slow down NECTAR Pre-fill so applicability suggestions stop failing

## Problem

The SOW drafting step already survives our AI provider's 8-req/min ceiling: every model call is gated by `acquireBedrockSlot()` (shared Postgres bucket in `src/lib/nectar-rate-limit.server.ts`), and transient failures (429/5xx) are thrown as `TransientAIError` and retried by the caller.

The "Pre-fill with NECTAR" applicability step (`prefillRequirementMappings` in `src/lib/nectar-engine.functions.ts`) does neither:

- It fans out `PREFILL_CONCURRENCY = 4` workers, each calling `aiPropose` → `callBedrockChatCompletions` directly.
- `aiPropose` never calls `acquireBedrockSlot()`, so 4 workers race past the 8/min quota within seconds.
- On a `BedrockError` with `status === 429` it throws a generic `Error("AI rate limit reached…")`. The worker `catch { failed += 1; }` block swallows it and skips that requirement — no retry, no wait. A batch of 50+ ends up mostly failed.

Fix: route pre-fill through the same slot gate + transient-retry pattern used for drafting. Scope is intentionally narrow — only the applicability pre-fill path.

## Changes

### 1. `src/lib/nectar-engine.functions.ts` — gate + classify AI calls

- Convert `aiPropose` from a `.functions.ts` inline helper into a thin wrapper that calls a new server-only helper. Since `.functions.ts` module-scope code ships to the client, move the AI + rate-limit imports inside the handler (already dynamic for `ai-bedrock.server`; do the same for the new helper) OR simply add the logic inside `aiPropose` using dynamic imports for `acquireBedrockSlot`, `recordBedrockTokens`, and the `TransientAIError` class from `@/lib/authoritative-sources.server` + `@/lib/nectar-rate-limit.server`.
- Inside `aiPropose`, before `callBedrockChatCompletions`:
  - `await acquireBedrockSlot()` — blocks up to 60s for a shared slot.
  - If `acquireBedrockSlot` throws `RateLimitError`, re-throw as `TransientAIError` with its `waitMs` so the caller can retry.
- On `BedrockError`:
  - `status === 429` or `[408, 500, 502, 503, 504].includes(status)` → throw `TransientAIError(msg, 30_000)` (matches `extractOnce`).
  - `status === 402` → re-throw as a hard error (credits — no retry).
  - Other statuses → keep as hard error.
- On success, best-effort `recordBedrockTokens(usage.total_tokens)` using the returned `json.usage` (mirrors `extractOnce`).

### 2. `prefillRequirementMappings` worker loop — retry transient errors, lower concurrency

Same file, handler at lines ~637-789:

- Drop `PREFILL_CONCURRENCY` from `4` to `2`. The slot gate already serializes to ~8/min; two workers keep steady pressure without stampeding when several requests wake at once.
- Wrap the `aiPropose(...)` call in a per-requirement retry loop, mirroring `processDraftChunk`:
  - `MAX_ATTEMPTS = 4`.
  - On caught error: if `isTransientAIError(err)` (imported from `@/lib/authoritative-sources.server`), read `err.retryAfterMs` (fallback `30_000`), clamp to `[5_000, 120_000]`, `await sleep(retryAfterMs)`, and retry.
  - Non-transient error, or attempts exhausted → increment `failed` and continue (existing behavior).
- Keep the existing "unknown placeholder" insert path for `normalized.length === 0`.
- No changes to schema, RLS, DB, or UI counters. The returned `{ processed, inserted, failed, skipped }` shape is unchanged; `failed` should now be near-zero for typical batches.

### 3. Nothing else changes

- Drafting path (`processDraftChunk`, `extractOnce`, `nectar-draft-tick.server.ts`) is untouched.
- Other AI features platform-wide are untouched.
- No new tables, migrations, or edge functions.
- `PREFILL_CONCURRENCY` stays a module constant; only its value and the retry loop change.

## Verification

- Click **Pre-fill with NECTAR** on a batch of 50+ unmapped SOW requirements. Expect `inserted` ≈ `candidates`, `failed` ≈ 0, wall-clock ~6–8 minutes at 8 rpm.
- `nectar_rate_state` shows steady per-minute counters instead of a burst.
- Manually forced 429 (e.g. throttled Bedrock) causes retries with backoff, not immediate failure.
- Drafting a fresh SOW still works identically (no regression on the shared helpers).
