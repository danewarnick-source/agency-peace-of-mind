## Problem

Smart Import shows a successful "Done" screen, but the imported client never appears under **Clients**. Investigation against the live database for True North found 5 import jobs in status `submitted_for_setup` with `import_subjects.review_status = 'ready'` but `committed_at = NULL`, `committed_record_id = NULL`, and `commit_error = NULL` — and **no matching row in `clients`**. Only one job (Caleb Sorenson) ever produced a real client record.

Root causes:

1. **No retry path.** `submitForSetup` runs `runJobCommit` once. If a subject silently fails to commit (e.g. an early version of `submitForSetup` that only flagged "advisory — no real records written", which is exactly what we see in `import_audit` for the orphaned jobs), the subject is permanently stuck at `review_status = 'ready'` with no UI to re-fire the commit. Re-opening the Done page does not re-attempt them.
2. **No client-list cache invalidation.** After a successful commit, nothing tells TanStack Query to refetch the Clients directory, so a freshly-imported client doesn't appear without a manual reload.
3. **No visibility into stuck jobs.** The Clients tab gives no hint that there are ready-but-uncommitted subjects waiting.

## Fix

Three small, additive changes — no schema work, no behavior change for the happy path.

### 1. `src/lib/smart-import-commit.functions.ts` — make commit truly idempotent on re-run
- The existing `commitSmartImportJob` already loops only over subjects with `review_status = 'ready'` and `committed_at IS NULL`. Keep that contract.
- Add a small companion server fn `recommitSmartImportJob` (same `requireSupabaseAuth` middleware, same `jobId` validator) that:
  - Loads the job, asserts the caller is an org admin/manager (`requireOrgMembership('admin')`).
  - Calls the existing `runJobCommit` helper.
  - Returns `{ results, jobCommitted }` exactly like `commitSmartImportJob`.
  - This gives us a single, explicit "retry" entry point distinct from the auto-run path so the UI can label the button "Retry commit".

### 2. `src/routes/dashboard.smart-import.$jobId.done.tsx` — wire retry + cache invalidation
- After any successful commit (auto-run OR retry button), call `queryClient.invalidateQueries({ queryKey: ["clients"] })` and `["smart-import-history"]` so the Clients directory and the Smart Import history pick up the new rows immediately.
- Add a **"Retry commit"** button visible whenever the readout reports any subject in `review_status = 'ready'` with `committed_at IS NULL`. It calls the new `recommitSmartImportJob` and refreshes the readout. The button is hidden when everything is already committed.
- Make the success toast explicit: `"Imported N client(s) into your directory."` (currently the user only sees a generic Done page and assumes save = visible).

### 3. `src/routes/dashboard.clients.tsx` — surface stuck imports
- Add a lightweight query (admins/managers only) for `import_jobs` belonging to this org with `status IN ('submitted_for_setup','review')` and at least one ready-but-uncommitted subject. Render a single-line amber banner above the directory: *"N Smart Import job(s) have uncommitted clients — Finish import →"* linking to the most recent stuck job's Done page. No banner when there are none.

### 4. One-time backfill for the 5 orphaned jobs already in the database
- After the retry button ships, walk the existing stuck subjects through `recommitSmartImportJob` once (the user clicks "Finish import" in the new banner). No SQL handoff needed.

## Acceptance

- Running a fresh Smart Import and clicking **Submit for setup** results in the new client appearing on the Clients tab without a page reload.
- Re-opening an old job whose subjects are `ready` but uncommitted shows a **Retry commit** button that, when clicked, creates the missing `clients` row(s) and updates the subject's `committed_record_id`/`committed_at`.
- The Clients tab shows an amber "uncommitted clients" banner whenever such a job exists, and the banner disappears after retry.
- No schema changes. Existing successful jobs are unaffected.

## Out of scope

- The white-glove (HIVE migration) path keeps its existing provider-signoff gate — Retry only runs after sign-off, same as today.
- Employee/auth-user creation from import still requires the invitation flow; this fix is for the client-record gap the user reported.
