
# Employee profile — parity with client profile + fix quick-edit save

Two problems, one plan:

1. **Bug**: values entered in the list "quick edit" dialog don't show on the employee profile page (screenshot shows Name not set / email/phone/employee_id/position all "—", only worker_type persisted).
2. **Feature**: employee profile should look and behave like the client profile — onboarding forms, applications, and uploaded authoritative documents that NECTAR reads and auto-distributes into profile fields.

---

## Part 1 — Fix quick-edit → profile

**Diagnose first, then fix.** The quick-edit mutation in `dashboard.employees.index.tsx` writes `full_name`, `email`, `employee_id`, `position`, `positions`, `worker_type`, `start_date`, `end_date`, `hire_date`, `ce_suggested_topics` to `profiles` in one call and throws if 0 rows come back. Screenshot shows `worker_type` saved but nothing else — that shape is only possible if:

- the update targeted a **different** `profiles.id` than the one the profile page reads (mismatched `userId` vs membership row), **or**
- the RLS policy silently drops non-`worker_type` columns via a column-level restriction, **or**
- the profile page is reading a cached/stale snapshot from a different query key.

Steps:

1. Add explicit `.select("id, full_name, email, employee_id, position, worker_type")` on the quick-edit update and log/toast the returned row so we can confirm what actually persisted.
2. Verify the `userId` passed into the dialog is the `profiles.id` (auth user id) of the row the profile route loads by `staffId`. Currently `EditableMember.userId` is set from `organization_members.user_id`; make sure the profile route's `staffId` is the same id (audit both call sites; align if needed).
3. Invalidate the profile-page query keys (`["staff-profile", staffId]`, `["members"]`, `["staff-pii"]`) on save so the profile page refetches without a hard reload.
4. If the returned row shows the writes succeeded but the profile page still shows "—", the profile fetch is stale — fix the query key / add a `router.invalidate()` after save.
5. Re-read `profiles` RLS via `supabase--read_query` and confirm no column-level `UPDATE` restriction is silently narrowing writes.

Same treatment for the pencil-edit "Contact & position" card on the profile page (`dashboard.employees.$staffId.tsx` line ~407): it already updates `phone`, `employee_id`, `department`, `worker_type`, `hire_date`; extend `onSaved` to invalidate the profile query and confirm rows returned.

**No behavior change to the quick-edit UI** — just make sure what the user types lands on the row the profile displays, and the profile shows it immediately.

## Part 2 — Employee profile becomes a first-class intake surface (client parity)

Mirror the client profile pattern (`src/components/clients/*` + `dashboard.clients.$clientId.tsx`) on the employee side. The building blocks already exist for clients — reuse the same shape.

### New employee profile sections (on `dashboard.employees.$staffId.tsx`, Overview tab)

1. **Employee documents card** (mirrors `client-documents-card.tsx`)
   - Upload area for onboarding forms, applications, I-9/W-4, resume, certifications, background check, driver's license, direct-deposit form, offer letter, etc.
   - Stored in a new `employee_documents` table (org-scoped, RLS, GRANTs) with `staff_id`, `kind`, `file_path`, `uploaded_by`, `nectar_status`.
   - Files land in a Supabase Storage bucket `employee-docs` (private, signed URLs).

2. **Intake checklist card** (mirrors `client-intake-checklist-card.tsx`)
   - Progress bar for the HR onboarding packet: Application, I-9, W-4, direct deposit, emergency contact, signed handbook, background check, TB/CPR, driver's license copy, etc.
   - Items check off automatically when the matching document is uploaded or the matching profile field is populated.

3. **Tracked fields card** (mirrors `tracked-fields-card.tsx`)
   - Read-only surface of profile fields with provenance chips (Source doc / Manual / Nectar-suggested), same UX as the client version.

4. **Finish onboarding / Setup checklist** (mirrors `finish-onboarding-card.tsx` + `setup-checklist.tsx`)
   - Gate "Employee ready to work" state on the checklist reaching 100%.

### NECTAR extraction → autofill

Reuse `src/lib/smart-import.functions.ts` (already has `mode: "employee"` and `aiExtractEmployeeFieldsFromText`). Extend it so that when a document is uploaded from the profile page (not just from the bulk Smart Import wizard), the extracted fields are:

1. Written to `extracted_fields` with `subject_type = "employee"` and `subject_id = staff_id`.
2. Routed through a new `applyEmployeeExtractedFieldsToProfile` helper that maps extraction keys → `profiles` columns:
   - `full_name`, `email`, `phone`, `employee_id`, `position`/`positions`, `worker_type`, `hire_date`/`start_date`, `department`, `date_of_birth`, `address`, `emergency contact`, `driver license #/expiry`, `direct deposit` (routed to a separate secured table), etc.
3. Only writes fields when the profile column is empty or the user approves an override (same "review" pattern the client flow already uses via `dashboard.smart-import.$jobId.review.tsx`).
4. Adds provenance rows to `import_field_provenance` so the tracked-fields card can show "from `application.pdf` (Nectar, 0.92)".

Reduced-liability notice already exists (`REDUCED_LIABILITY_NOTICE` in `authoritative-sources.functions.ts`) — surface it on the upload dialog exactly like the client side.

### Onboarding forms surface

Under a new "Onboarding" sub-tab on the employee profile:
- List of required forms pulled from `forms` (filter by `applies_to = "employee"`), same renderer used at `/dashboard/forms/$formId/fill`.
- Status per form: not started / draft / submitted / attested. Submissions flow through the existing `form_submissions` + `document_attestations` tables.

### New/changed tables (SQL handoff via `docs/SQL_HANDOFF.md`)

```
employee_documents(id, organization_id, staff_id, kind, file_path,
                   uploaded_by, uploaded_at, nectar_status, nectar_job_id)
+ RLS org-scoped, GRANTs for authenticated/service_role
+ storage bucket "employee-docs" (private)
```
Reuse existing `extracted_fields`, `import_field_provenance`, `unfiled_items`, `forms`, `form_submissions`.

### Files to touch

- `src/routes/dashboard.employees.$staffId.tsx` — add Documents, Intake checklist, Tracked fields, Onboarding tab sections.
- `src/routes/dashboard.employees.index.tsx` — quick-edit fix + invalidation.
- `src/components/employees/` (new folder) — `employee-documents-card.tsx`, `employee-intake-checklist-card.tsx`, `employee-tracked-fields-card.tsx`, `employee-onboarding-tab.tsx`.
- `src/lib/employee-documents.functions.ts` (new) — upload, list, delete, trigger extraction.
- `src/lib/smart-import.functions.ts` — expose a single-document ingest entrypoint for the profile page (bypass wizard), reusing `aiExtractEmployeeFieldsFromText`.
- `src/lib/employee-profile-autofill.ts` (new) — extraction-key → `profiles` column mapping + provenance writes.
- `supabase/migrations/*.sql` + `docs/SQL_HANDOFF.md` — `employee_documents` table + storage bucket policies.

### Out of scope for this plan
- No new NECTAR model, no auto-approve of writes: extraction always lands as "suggested" until the admin accepts, matching the client flow.
- Direct-deposit account numbers and SSN are extracted only into PII-gated storage (never into `profiles`), gated by `can_view_staff_pii()`.
- No change to bulk Smart Import wizard UX — the per-employee upload is an additional entry point, not a replacement.

## Verification before "done"
- Reproduce the original bug by editing an employee in the list and confirm the profile updates without a hard refresh.
- Upload an application PDF on a test employee, confirm extracted fields appear as suggestions on the tracked-fields card, approve, confirm they land in `profiles` and show on the Overview.
- Run `npm run build` (regenerates `src/routeTree.gen.ts`), stage together.
