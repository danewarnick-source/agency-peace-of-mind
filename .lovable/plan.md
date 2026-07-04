## Goal

Give us a way to tell — from the DB and from the UI — whether NECTAR is *actually calling the AI* or *silently 429-looping*, without touching extraction, retries, or pacing.

## What "in-flight" means here

Every AI attempt writes a lightweight heartbeat before and after the call. Successes and hard failures already leave a trace (`processed_indices` / `chunk_failures`). Only transient errors are invisible today. We add:

- a counter for total AI attempts started
- a counter for transient errors
- the last transient message + when it happened
- the wall-clock time of the last attempt (so we can see "an AI call is currently mid-flight — started 40s ago")

If `attempts_started` keeps climbing but `processed_chunks` doesn't, that's a throttle loop. If `attempts_started` climbs and `processed_chunks` follows a beat later, the AI is genuinely reading.

## Schema change (migration)

Add four columns to `public.nectar_draft_jobs`:

```sql
alter table public.nectar_draft_jobs
  add column if not exists attempts_started integer not null default 0,
  add column if not exists transient_errors integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_transient_at timestamptz,
  add column if not exists last_transient_message text;
```

No new RLS policies needed — existing job policies already cover the row. No GRANT changes needed for the same reason (columns inherit the table's grants).

## Server changes (both driver paths)

Two places call `extractChunkWithRetry` for a job chunk today; both get the same three-step wrap. No behavior change, no new retry logic, no extra AI calls.

**`src/lib/nectar-draft-tick.server.ts` → `processOneChunk`:**
1. Before the `extractChunkWithRetry(...)` call: `update nectar_draft_jobs set attempts_started = attempts_started + 1, last_attempt_at = now() where id = jobId`.
2. On `TransientAIError`: `update ... set transient_errors = transient_errors + 1, last_transient_at = now(), last_transient_message = <first 300 chars of err.message>`.
3. On success or hard failure: nothing extra — existing `persistChunkResult` already records the outcome.

**`src/lib/authoritative-sources.functions.ts` → `processDraftChunk` handler** (the client-driver path): same three-step wrap around its `extractChunkWithRetry` call, using `supabaseAdmin` (already loaded there for the job update).

Both use small targeted `UPDATE` statements (not read-modify-write) so concurrent workers can't clobber each other. The columns are pure counters + timestamps, so a lost update is at worst a slightly-low count.

## Type + UI surface

- Regenerate `src/integrations/supabase/types.ts` picks up the new columns automatically on the next Supabase types sync — no manual edit.
- In `src/components/nectar/draft-jobs-driver.tsx` (or whichever component renders the "reading section X of N" indicator — I'll grep to confirm the exact file), extend the existing job subscription/select to include the four new fields and render a small muted line under the progress bar:
  - When `attempts_started > processed_chunks + (chunk_failures.length)` **and** the delta is growing across polls → show "AI call in flight (started {relative time})".
  - When `transient_errors > 0` in the last 60s → show "Waiting for AI capacity — {transient_errors} rate-limit signal(s), last: {relative time}".
  - Otherwise → no extra line (keeps the UI quiet when things are healthy).

This is display-only text; it doesn't change the driver's control flow, backoff, or `pausedUntil`.

## What is deliberately NOT changing

- Chunk size / overlap / max chunks (the recent 5× change stays).
- `extractOnce` / `extractChunkWithRetry` / prompt / `max_tokens` / JSON schema / halving fallback.
- `TICK_CONCURRENCY`, `LARGE_DOC_CHUNK_THRESHOLD`, `LARGE_DOC_INTER_CALL_PAUSE_MS`.
- Client-driver `pausedUntil` shared backoff.
- Persistence of `extracted_items`, `chunk_failures`, `processed_indices`, `chunk_durations_ms`.

## How we'll know it worked

For the currently-stuck job (`87c85fad…`), within 30s of shipping this we can run:

```sql
select attempts_started, transient_errors, processed_chunks,
       last_attempt_at, last_transient_at, last_transient_message
from public.nectar_draft_jobs where id = '87c85fad-2288-4edf-b5c7-b91ab5a07789';
```

and get an unambiguous answer:
- `attempts_started` climbing + `last_transient_message` populated → Bedrock is throttling, not reading.
- `attempts_started` = 1 or 2, `last_attempt_at` fresh, no transient → AI call is genuinely mid-flight; wait.

## Files touched

- new `supabase/migrations/<timestamp>_nectar_draft_job_inflight.sql`
- `src/lib/nectar-draft-tick.server.ts` (wrap `processOneChunk`)
- `src/lib/authoritative-sources.functions.ts` (wrap `processDraftChunk` handler)
- one component file rendering the progress indicator (confirmed via grep before edit — likely `src/components/nectar/draft-jobs-driver.tsx` or a sibling in `src/components/nectar/`)
