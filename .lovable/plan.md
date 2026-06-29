
# Pending Clients / Import Finalization Workspace

End-to-end repair of Smart Import → Client Directory finalization. Reuses existing validation, commit, audit, and RBAC. One additive migration; everything else is server-fn + UI work.

## 1. Migration (additive only)

`import_subjects.review_status` CHECK is `pending|in_progress|ready|approved` — do NOT widen. Add discard columns instead:

```sql
ALTER TABLE public.import_subjects
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS discarded_by uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS import_subjects_pending_client_idx
  ON public.import_subjects (org_id)
  WHERE subject_type = 'client' AND committed_at IS NULL AND discarded_at IS NULL;
```

Rollback: `ALTER TABLE … DROP COLUMN IF EXISTS discarded_at, DROP COLUMN IF EXISTS discarded_by;` and drop the index. No data loss.

## 2. Server functions

### `src/lib/smart-import-review.functions.ts`

**Gate `setSubjectReady`** — before writing `"ready"`:
1. Load `extracted_fields` + `validation_overrides` for the subject.
2. Build draft via existing `buildDraftFromExtractedFields`.
3. Run `validateClientDraft` + `filterBlocking`.
4. If blocking non-empty → leave `review_status='in_progress'`, write `commit_error` = blocking summary, return `{ ok:false, blocking }`. **Never** write `needs_info`/`discarded` (CHECK forbids).
5. Only when clean → set `"ready"`, clear `commit_error`. Skip rows with `committed_at` set.
6. Write `import_audit` row (`item:"client"`, `action:"mark_ready_blocked"|"mark_ready"`).

**New `applyClientFields({ subjectId, fields })`** — generalized version of `applyMissingClientFields`:
- Accepts any of: `first_name`, `last_name`, `date_of_birth`, `physical_address`, `medicaid_id`, `admission_date`, `discharge_date`, `form_1056_approved_date`, guardianship set, emergency-contact set, billing-code rows.
- Upserts each into `extracted_fields` with `status:"edited"`, `provenance:"admin_override"`, `edited_by`, `edited_at`; preserves `original_value` (only set on first edit).
- Billing-code writes honor `EVV_SERVICE_CODES.evvLock` (refuse to edit EVV-locked code rows; surface a non-fatal warning).
- After write, re-runs validation; returns `{ blocking, readyToFinalize, missingRequiredFields }`.
- Single `import_audit` row per call listing changed fields.
- Keep `applyMissingClientFields` as a thin compatibility wrapper.

**New `getPendingClientSubjects()`** (auth'd to caller's org):
- Selects `import_subjects` where `subject_type='client' AND committed_at IS NULL AND discarded_at IS NULL`, in caller's org.
- Joins `import_jobs` for date / source label.
- For each subject: load extracted_fields, build draft, run validation, return `{ subjectId, jobId, displayName, importDate, sourceLabel, reviewStatus, blockingIssues:[{key,field,message}], missingRequiredFields, readyToFinalize, matchedRecordId, hasMergeFlag }`.
- Returns plain DTO array. Used by workspace + banner count.

**New `discardSubject({ subjectId })`**:
- Verify `committed_at IS NULL` (cannot discard committed).
- Set `discarded_at = now()`, `discarded_by = userId`.
- Write `import_audit` row (`action:"discard"`).

### `src/lib/smart-import-commit.functions.ts`

**Add optional `subjectId` to `runJobCommit(sb, userId, jobId, opts?:{ subjectId?:string })`**:
- When set, the per-subject loop filters to that one subject. All other semantics preserved (idempotent `committed_at` guard, per-subject independence).
- Preserves the existing all-or-nothing per-subject commit (validate → insert into `clients` → only then set `committed_at`/`committed_record_id`/`review_status='approved'`; on failure persist `commit_error` and leave pending).

**New `commitSingleSubject({ jobId, subjectId })`** — thin server-fn wrapper around `runJobCommit` with `subjectId`. Returns per-subject outcome.

**New `saveAndFinalizeSubject({ subjectId, fields })`** — orchestrator used by editor's primary action:
1. `applyClientFields` (if any fields).
2. Re-validate.
3. If clean → `setSubjectReady` → `commitSingleSubject`.
4. Returns `{ status:"committed"|"blocked"|"saved", blocking?, committedRecordId? }`.

All gated by existing `requirePermission("manage_users")`.

## 3. Routes & components

### New route: `src/routes/dashboard.clients.pending.tsx`
- Wrapped in `RequirePermission perm="manage_users"`.
- TanStack Query: `ensureQueryData` + `useSuspenseQuery` on `getPendingClientSubjects`.
- `errorComponent`, `notFoundComponent` provided.
- After build, `src/routeTree.gen.ts` regenerates automatically.

### `PendingClientsPage`
- Toolbar: search by name, filter by status / "has blocking" / "duplicate flag", sort by name / date / status.
- List of `PendingClientRow` cards: display name (or "Unnamed imported client"), job ref + import date, source doc label, status chip, blocking-issue summary (verbatim messages), missing-fields chips, ready-to-finalize indicator, possible-duplicate badge linking to existing review diff (`/dashboard/smart-import/$jobId/review`).
- Row actions: **Complete missing info** (opens editor), **Save & finalize** (enabled when `readyToFinalize`), **Open in review**, **Discard**.
- Loading skeleton, empty state ("All imported clients are finalized"), error fallback.
- Mobile-responsive; accessible labels; focus management on dialog open.

### `src/components/smart-import/finalize-client-editor.tsx` (Dialog)
- Props: `subjectId`, `jobId`, `onClose`, `onFinalized`.
- Seeds form via `getReviewData` for current values.
- Renders sections driven by blocking-issue keys (see issue→field mapping below). Each blocking issue shows: what's missing, why it blocks, verbatim validator message.
- Unmapped blocking issues render read-only with explanation — never hidden.
- **Save** → `applyClientFields`, live-updates indicator.
- **Save & finalize** → `saveAndFinalizeSubject`. Idempotent. Disabled while pending; toast on success "Imported 1 record into your directory."; error states surface verbatim.
- Duplicate guard: if `matchedRecordId` or `hasMergeFlag`, show inline warning + "Review possible match" link before finalize is enabled (requires explicit acknowledgement checkbox).
- EVV-locked billing codes: rendered read-only with a "Locked by EVV" badge.

**Issue-key → field map** (from `import-validation.ts`):
- `name.first_missing|first_invalid` → `first_name`
- `name.last_missing|last_invalid` → `last_name`
- `address.invalid|missing` → `physical_address`
- `medicaid.format` → `medicaid_id`
- `dates.admission_after_discharge|admission_discharge_invalid` → `admission_date` + `discharge_date`
- `dates.form_1056_future` → `form_1056_approved_date`
- `code.unknown.*|plan_order.*|rate_implausible.*` → billing code rows
- `contradiction.guardian_*` + guardian keys → guardian fields
- emergency-contact keys → emergency-contact fields

### `DiscardPendingDialog`
- Destructive confirmation naming the subject; explains archive (not delete), 7-yr retention preserved.

## 4. Existing-file edits

### `src/routes/dashboard.clients.tsx`
- Replace `stuckImports` query: call `getPendingClientSubjects` (or count-only variant). Count is **subjects**, not jobs.
- Banner copy: `"{n} imported client{s} need finishing before they join your directory."`
- Link `to="/dashboard/clients/pending"`. Remove `params={{ jobId: stuckImports[0] }}`.
- Roster query untouched.

### `src/routes/dashboard.smart-import.$jobId.done.tsx`
- Remove `/guardian/i.test(s.error)` gate.
- For any subject with blocking issues, render **Complete missing info** opening shared `FinalizeClientEditor`.
- Keep readiness readout, audit trail, undo, "Open clients" actions.

### `src/routes/dashboard.smart-import.history.tsx`
- Wording alignment with workspace lifecycle. Reuse `discardImportJob` for job-level discard. No flow regression.

### `src/lib/smart-import-history.functions.ts`
- Ensure `discardImportJob` either sets `discarded_at` on subjects or stays job-scoped — verify and align so a job-discard hides its subjects from the workspace (likely: also stamp `discarded_at` on all uncommitted subjects in that job).

## 5. Audit trail (reuses `import_audit`)
- `mark_ready` / `mark_ready_blocked` (gated `setSubjectReady`)
- `field_edit` (one row per `applyClientFields` call, with changed-field list in `traces_to`)
- `commit_success` / `commit_failed` (single-subject path mirrors existing job-commit logging)
- `discard` (subject-level)

## 6. RBAC
Route, workspace, editor mutations, finalize, discard all gated by `manage_users` (route: `RequirePermission`; server fns: existing `requirePermission` helper).

## 7. Out of scope / FUTURE
- Net-new merge UI (workspace surfaces existing flag only).
- NECTAR "explain why this can't finalize" answer.
- Admin Home pending-clients badge — include only if it trivially fits the existing needs-attention pattern; otherwise FUTURE.
- Any Scheduler/EVV/Training/Reports change. Protected.

## 8. Verification
- `npx tsgo --noEmit` clean.
- `npm run build` regenerates `src/routeTree.gen.ts`; new route reachable.
- Manual QA per §25 checklist: reproduce stuck-name case → fix via editor → commits → appears in roster with `committed_at`+`committed_record_id`+`approved`; `setSubjectReady` refuses blocking; discard archives + audits; banner count matches subjects; double-click safety; EVV locks intact; no roster leak of uncommitted/discarded; no regression to Scheduler/EVV/Training/Reports.

---

**One open question before I implement:** the migration adds `discarded_at`/`discarded_by` columns on `import_subjects`. This will be sent for your approval via the migration tool. Confirm or say "skip migration" and I'll route discard purely through `import_audit` + an in-memory filter (less clean, but truly zero-schema).
