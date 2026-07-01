## Plan

1. **Fix the actual delete behavior in the billing-code table**
   - In the Smart Import billing editor, keep a local list of deleted row IDs so the row disappears immediately after the server confirms “Removed,” even before the refetch completes.
   - Continue using the existing `removeExtractedField` server function; no new server function.

2. **Make dismissed rows impossible to reappear from stale props**
   - Filter billing rows with both `dismissed_at` and the local deleted-ID guard.
   - Reset the local guard only when a fresh row list no longer contains those IDs.

3. **Fix validation/ready checks to honor deleted rows everywhere**
   - Update the mark-ready validation path to exclude `dismissed_at` rows, matching the review screen and commit path.
   - This prevents deleted rows like SCE from continuing to influence review flags.

4. **Tighten feedback**
   - Change the success toast from generic “Removed” to a clearer message like “Removed from this import — it will not be created or billed.”

5. **Verify**
   - Confirm source paths all use active-only extracted rows for review, ready, and commit.
   - If possible, reproduce the delete path in the preview to verify SCE disappears and the review state updates.