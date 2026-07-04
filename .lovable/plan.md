## Goal

Reduce the number of AI requests NECTAR makes per authoritative-source document by making each chunk ~5× larger. Nothing about extraction, retries, pacing, persistence, or dedupe changes.

## The single change

In `src/lib/authoritative-sources.server.ts`, raise the default chunk-window size (and proportionally the overlap) used by `chunkDocumentRanges` / `chunkDocumentText`:

- `windowSize`: `12_000` → `60_000` characters (5×)
- `overlap`: `800` → `4_000` characters (kept at the same ~6–7% of window so section boundaries still get double-covered)
- `maxChunks`: `80` → `20` (still well above the new expected max of ~4–5 for a large SOW, but no longer allows the old 20+ small-chunk behavior as a fallback)

That's it — same function signature, same return shape, same boundary-snapping logic (still prefers a `\n\n` break near the tail of each window). Every caller already relies on the defaults:

- `src/lib/authoritative-sources.functions.ts:1243` — `chunkDocumentRanges(rawText)`
- `src/lib/authoritative-sources.server.ts:270` — `chunkDocumentText(text)` inside `extractRequirementsFromText`

so no call sites need edits.

## What is deliberately NOT changing

- `extractOnce` / `extractChunkWithRetry` / `extractOnceWithTransientRetry` — same prompt, same `max_tokens: 8192`, same JSON schema, same split-in-half fallback on `ChunkParseError` (so if a 60k window ever returns truncated JSON, it recursively halves down to ~30k, ~15k, etc., preserving completeness).
- `TICK_CONCURRENCY`, `LARGE_DOC_CHUNK_THRESHOLD`, `LARGE_DOC_INTER_CALL_PAUSE_MS` in `src/lib/nectar-draft-tick.server.ts` — pacing stays exactly as tuned. A large SOW at ~5 chunks is still `> LARGE_DOC_CHUNK_THRESHOLD` under some inputs but the pacing logic is safe either way; not touching it.
- Client driver in `src/components/nectar/draft-jobs-driver.tsx` — shared `pausedUntil` backoff on 429 stays as-is.
- Job schema, `chunk_ranges` persistence, dedupe keys, failure reporting — untouched.

## How we'll know it worked

Uploading the same large SOW that previously produced ~20 chunks now produces ~4–5 chunks (visible in the draft job's `total_chunks` and the "reading section X of N" indicator). Extracted requirement counts should be comparable to the previous run (the halving fallback catches the rare case where a 60k window trips the model's output limit).

## Files touched

- `src/lib/authoritative-sources.server.ts` — three default arg values on `chunkDocumentRanges` (and the mirrored defaults on `chunkDocumentText`).
