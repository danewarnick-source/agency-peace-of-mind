## Goal
Make SOW 2026 (and any similarly large document) draft requirements reliably end-to-end, without losing progress on retries and without repeatedly tripping the AI rate limit.

## What changes

### 1. Successfully-read sections are permanent
- Every section that returns valid extracted requirements is written to the draft immediately and its chunk index is marked `processed` in the job row.
- Retry logic only looks at sections whose status is `failed` or `pending` (never attempted). Already-`processed` sections are skipped entirely — no re-read, no re-prompt, no additional AI cost.
- The "still working" guard added last round (`processedCount < chunkCount` blocks finalize) stays, so a job cannot silently complete with gaps.
- Transient errors (429 / 5xx) leave the section as `pending` (not `processed`, not `failed-permanent`) so the next tick picks it up.

### 2. Pacing for large documents to avoid rate limits proactively
- For documents above a size threshold (SOW 2026 at ~24 sections qualifies), the driver runs **2 sections at a time** with a short pause (~1.5s) between AI calls, instead of the current "as fast as possible then back off."
- Concrete settings for large docs:
  - `TICK_CONCURRENCY = 2`
  - `CLIENT_CONCURRENCY = 2`
  - Inter-call pause: ~1.5s between chunk extractions within a tick
  - Between ticks: ~3s pause
- Small/normal docs keep current speed — pacing only kicks in when `total_chunks > 10` (tunable) so short PDFs aren't slowed down.
- Transient-error backoff (0.3s / 1.5s / 3s from last round) remains as the recovery path if the rate limit is still hit.

### 3. Resume SOW 2026 cleanly
- The previously-failed SOW 2026 job stays marked failed. When the user clicks **Draft requirements** again, a fresh job starts under the new pacing rules and processes all 24 sections — no re-upload needed.
- If any old partial results exist for that document, they are discarded at job start so the new run is a clean slate (avoids mixing old truncated output with new).

### 4. Visible progress
- Progress driver copy: "Processing section X of Y — pacing AI calls to stay under the rate limit."
- On transient retry: "Waiting for AI capacity, resuming automatically." (no error toast)
- On permanent failure of a single section: surface which section failed so the user knows draft is partial and can retry just that one.

## Files touched
- `src/lib/authoritative-sources.server.ts` — pacing knobs, "skip already-processed" guard in retry path, size-based concurrency selection.
- `src/lib/nectar-draft-tick.server.ts` — 2-at-a-time worker with inter-call delay for large docs; keep transient-vs-permanent distinction.
- `src/lib/authoritative-sources.functions.ts` — finalize guard already in place; add "reset partial results on fresh job start" for the same source.
- `src/components/nectar/draft-jobs-driver.tsx` — updated user-facing copy for pacing/waiting states.

## Non-goals
- No schema changes.
- No change to extraction prompt or requirement shape.
- No change to how small documents draft today.
