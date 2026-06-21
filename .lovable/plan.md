Yes — the screenshot shows a real commit-blocking validation error: the client was treated as not being their own guardian, but no guardian name was present. Today Smart Import only shows that as an audit/readiness error and asks you to retry, instead of giving you a quick way to fill the missing data.

Plan:

1. Fix the underlying guardian default path
   - Keep the existing rule: if the document does not clearly name a separate guardian, commit the client as their own guardian.
   - If the document/admin says there is a separate guardian, require `guardian_name` before the real client insert runs.
   - Make this validation happen before the database insert so the UI can show a clean “missing info” message instead of a raw database error.

2. Add a quick missing-information popup on the Smart Import Done page
   - When a ready client is not committed because required info is missing, show a button like `Complete missing info` instead of only `Retry commit`.
   - The popup will show only the fields needed to unblock commit, starting with the guardianship case:
     - “Client is their own guardian” toggle
     - Guardian name
     - Guardian phone
     - Guardian relationship
     - Guardian email
   - If “client is their own guardian” is selected, guardian fields are cleared/ignored and retry can commit immediately.
   - If “separate guardian” is selected, guardian name is required in the popup.

3. Save the popup answers back into the Smart Import staging data
   - Add a server function that updates existing `extracted_fields` rows or inserts admin-entered stubs when the field was missing.
   - Mark those values as admin override / edited so the import audit trail stays accurate.
   - Clear the subject’s old `commit_error` after saving the fix.
   - No schema changes.

4. Retry commit automatically after the popup saves
   - After saving the missing fields, re-run the existing recommit function for that job.
   - Refresh the Done page and Clients directory caches so `Open clients` shows the newly created client without a manual reload.

5. Expand Smart Import’s client field list so future reviews can see/edit these fields before commit
   - Add guardian and emergency-contact fields to the review dropdowns and extraction target list, so staff can correct them during review rather than waiting for a commit failure.

Technical notes:
- Files to change:
  - `src/lib/smart-import-commit.functions.ts`
  - `src/lib/smart-import-review.functions.ts`
  - `src/lib/smart-import.functions.ts`
  - `src/routes/dashboard.smart-import.$jobId.review.tsx`
  - `src/routes/dashboard.smart-import.$jobId.done.tsx`
- No database/schema changes.
- This popup should handle commit blockers only. Advisory gaps like missing billing rates, provisional documents, or reminders should remain non-blocking.