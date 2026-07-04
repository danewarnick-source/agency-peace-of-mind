## What’s happening

SOW 2026 does **not** need to be deleted or re-uploaded. The file text is present and parsed: about **259k characters**, split into **24 sections**.

The latest draft job shows the real failure pattern:
- It processed only **13 of 24 sections**.
- All 13 recorded failures were AI rate-limit errors, starting with: **“AI rate limit reached. Try again in a moment.”**
- Because each failed section is currently counted as “processed,” the job can finalize early with **0 requirements**, even though 11 sections were never attempted.
- The current retry behavior only splits chunks for malformed/truncated AI output; it does **not** properly back off and retry rate-limit failures.

## Plan

1. **Stop treating rate limits as completed sections**
   - Change the chunk processor so transient AI failures like rate limits are not saved as permanently processed chunks.
   - Keep those chunks eligible for retry instead of letting the job finalize with missing sections.

2. **Add controlled retry/backoff for large SOWs**
   - Add a delay-and-retry path for 429/rate-limit errors.
   - Lower draft concurrency for large documents so the app does not fire too many AI calls at once.
   - Keep the background job model, but make it slower and steadier rather than failing fast.

3. **Finalize only when every section is actually done**
   - Update finalization to refuse completion when `processed_chunks < total_chunks`.
   - Return a “still working / retrying” state instead of a failed draft if sections remain.

4. **Make retry behavior visible and understandable**
   - Update the progress driver so a transient chunk failure pauses/retries instead of showing a final extraction error.
   - Use user-facing copy like “NECTAR is waiting for the AI rate limit to clear, then will continue.”

5. **Clean up the stuck SOW 2026 job state**
   - After the code fix, reset/restart the failed SOW 2026 draft job so it can run through all 24 sections under the safer retry rules.
   - Existing uploaded document stays in place.

## Technical notes

Files likely to change:
- `src/lib/authoritative-sources.server.ts`
- `src/lib/authoritative-sources.functions.ts`
- `src/lib/nectar-draft-tick.server.ts`
- `src/components/nectar/draft-jobs-driver.tsx`

Database/data cleanup:
- Mark the current incomplete `nectar_draft_jobs` row for SOW 2026 as failed or superseded, or start a fresh job after the fix.
- No schema migration should be needed unless the existing job table lacks enough state for retry timing; current columns appear sufficient for a code-only fix.