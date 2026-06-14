## Goal
Replace the generic "+ Upload certificate" button on the staff Certs & trainings tab with a per-item "+" upload control on every Compliance Checklist row. One click → file picker → file lands in that staff member's HR file and is linked to the specific requirement.

## What's already there (reuse, don't rebuild)
- `StaffHrChecklistCard` (`src/components/hr/staff-hr-checklist-card.tsx`) already renders each checklist row with a working per-row upload affordance (lines 504-535): a hidden `<input type="file">` that calls `uploadEvidence(file, row.requirement_id, row.category ?? "checklist_evidence")` and then `upsertFn` to set status `in_progress` with `evidence_document_id`.
- `uploadEvidence` (line 138) uses the existing `createUpload` server fn → signed PUT → HR documents storage (the same staff-file storage NECTAR HR docs already read).
- `viewDoc` (line 166) opens the attached evidence via `getDocUrl`.

The current limits are purely UI: the upload control only renders when `!completionDoc && !isSelf`. The pipe to the staff file is correct.

## Changes

### 1. `src/components/hr/staff-hr-checklist-card.tsx` — make "+" per-row, always visible
- Replace the existing conditional "Evidence" upload label with a permanent compact icon button per row:
  - When no evidence attached: just the "+" upload button (icon-only, `aria-label="Upload evidence"`).
  - When evidence attached: render the "Evidence" view button AND a "+ Replace" button so admins can add a newer document.
- `accept=".pdf,.doc,.docx,image/*"` on the file input (PDF, Word, images of certificates).
- Tap target ≥44×44 per project memory rule; keep `relative z-0`-ish positioning so it never hides behind the status pill.
- Keep the existing `isSelf` gate (self-view stays read-only; HR uploads remain admin/manager-only). N/A rows stay non-uploadable.
- No change to `uploadEvidence`, `upsertFn`, or the toast/invalidate flow.

### 2. `src/routes/dashboard.employees.$staffId.tsx` — drop the redundant button
- Remove the top-right "+ Upload certificate" button and its `ExternalCertUploadDialog` wrapper from `RequirementsTab` (lines ~358-371) and the related `uploadOpen` state + dialog import (only this import; do not remove `ExternalCertUploadDialog` from the codebase — it's still used by `/dashboard/external-certifications`).
- The header row keeps the "Certs & trainings" title; per-item "+" buttons are now the only upload entry point on this tab.

## Out of scope (explicitly)
- No new tables, buckets, or server functions; no schema change.
- No change to permissions: self stays read-only on HR checklist; admins/managers keep current write access via existing RLS on `staff_checklist_completion` + HR document upload.
- No change to the `/dashboard/external-certifications` page or its `UploadDialog` (still available for ad-hoc certs not tied to a checklist row).
- No change to HR docs tab, Deadlines tab, or client profile.

## Acceptance
- Every applicable Compliance Checklist row shows a "+" upload button. Clicking opens the OS file picker filtered to PDF/DOCX/images.
- Uploaded file appears in the staff member's HR file (visible in HR docs / NECTAR docs) AND is linked to that requirement (row flips to `in_progress` with `Evidence` button to view).
- Rows that already have evidence show both "Evidence" (view) and "+ Replace" (re-upload).
- The old top-right "+ Upload certificate" button is gone; no parallel upload path is left on this tab.
- N/A rows and self-view rows remain non-uploadable (unchanged).