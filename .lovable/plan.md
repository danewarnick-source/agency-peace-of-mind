# Org-wide pending-client workbench on the Review page

## The problem

The Smart Import Review page (`/dashboard/smart-import/$jobId/review`) is **job-scoped**. Its left "People" column lists only the subjects inside the currently-opened job. When the provider has two pending clients across two different import jobs (or the second client was created outside this job), only one appears — even though both need review.

The provider then has to bounce between the Pending Clients dashboard, Smart Import, and the Review page for each client. Painful.

## The change

Turn the left column into an **org-wide "Pending clients" queue**, so a provider can sit down once and finalize every pending client in a row. When they finish one (Complete client setup → committed / finalized), it drops off the list and the next pending client auto-loads.

Data already exists: `listPendingClientSubjects` in `src/lib/smart-import-review.functions.ts` returns every non-committed, non-discarded client subject across all jobs in the org (the Pending Clients dashboard uses it). We just haven't wired it into the review workbench.

## Scope (UI only, no schema changes)

### 1. `src/routes/dashboard.smart-import.$jobId.review.tsx`

- Add a second query alongside `getReviewJob`: `listPendingClientSubjects` → `orgPendingClients` (org-scoped, excludes finalized/discarded, includes `import_job_id`).
- Merge results into a single left-column list. Each row shows: display name, review status dot, and a small chip with the source (e.g. "This import" vs the other job's short id / created date) so the provider knows why a subject from another job is showing up.
- Rows from other jobs, when clicked, `navigate({ to: '/dashboard/smart-import/$jobId/review', params: { jobId: row.import_job_id } })` and then select that subject. Rows from the current job just call `setSelectedId` as today.
- Group ordering: current-job subjects first (preserves existing flow), then other-job pending clients, then a divider + "Recently finalized (this session)" collapsed section for reassurance.
- After a subject is marked ready + committed (existing `submitForSetup` / "Complete client setup" success path), invalidate both `["smart-import-review", jobId]` and `["pending-client-subjects", orgId]`, then auto-advance: pick the next non-ready subject from the merged list; if it belongs to another job, navigate there.
- Empty state when the merged list is empty: "All caught up — no pending clients to review." with a link back to `/dashboard/clients`.
- Keep employee-mode jobs unchanged (the org-wide queue is client-only; if `job.mode === 'employee'`, render the current job-only queue as today).

### 2. `SubjectQueue` component (same file)

- Accept the new merged list shape `{ id, display_name, review_status, match_status, source: 'current' | 'other', import_job_id, job_label? }`.
- Rename header from "People" → "Pending clients" (client mode only).
- Add a subtle "opens other import" indicator (small `Link2` icon + short job label) on other-job rows.
- Keep the existing status dot + match badges.

### 3. No backend / schema changes

- `listPendingClientSubjects` is already the right shape and already RLS-scoped to the org.
- No new server function, no migration, no RLS change.
- Employee imports, discard flow, and the wizard itself are untouched.

## Out of scope

- Reorganizing the wizard steps or per-step content.
- Any change to how subjects are created during extraction (that's the "second client not showing up because the import didn't produce a subject" case — separate issue, not this fix).
- Changing the standalone Pending Clients dashboard route.

## Acceptance

- Opening the review page for any job shows every pending client the org has, not just this job's.
- Clicking a pending client from another job navigates the workbench to that job and opens that client.
- Completing a client's setup removes it from the left column and auto-selects the next pending client (across jobs) without leaving the page.
- When nothing is left, the column shows a clean "all caught up" state.
