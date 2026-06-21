# Per-training "Upload certificate" button

## What's happening now
The fixed baseline trainings (30-Day, First Aid, CPR, Person-Centered Thinking, etc.) already have a working "Upload certificate" control wired to Nectar OCR — `BaselineActions` in `src/components/hr/staff-hr-checklist-card.tsx` renders a per-row upload input that:

1. Uploads the file to the HR-documents bucket.
2. Calls `attachBaselineCertificate` which downloads the file, runs Gemini 2.5 Flash OCR, extracts the expiration date, and writes it back to the row.
3. Falls back to `default_validity_months` from `staff-training-requirements.ts` if OCR can't read a date.

The reason no buttons appear in your screenshot is a permission gate: line 480 (`if (baselineKey && !isSelf)`) hides every baseline action — including the upload button — whenever the logged-in user is viewing their own employee record. The server-side helper `assertCanWriteStaff` in `staff-training-requirements.functions.ts` mirrors that and rejects self-edits outright.

For an admin who is also an employee (your `dane+zzztest` account), that means *their own* training rows show "not_started" with no controls.

## Changes

### 1. `src/components/hr/staff-hr-checklist-card.tsx`
- Drop the `!isSelf` guard around `<BaselineActions … />`. Always render the Mark complete + Upload certificate controls per row.
- Keep the existing "Replace/Upload" gate on the *legacy* admin-defined requirement branch as-is — that one still goes through `upsertChecklistCompletion`, which has its own auth.

### 2. `src/lib/staff-training-requirements.functions.ts`
Rewrite `assertCanWriteStaff` so it permits self-edits **only when** the caller has an admin/manager role in the org (so a regular DSP can't silently mark their own CPR complete). Pseudocode:

```ts
async function assertCanWriteStaff(sb, orgId, staffId, viewerId) {
  const { data: canView } = await sb.rpc("can_view_staff_pii", { _org: orgId, _staff: staffId, _viewer: viewerId });
  if (!canView) throw new Error("Forbidden: not allowed to edit this staffer");
  if (viewerId !== staffId) return;
  const { data: isAdmin } = await sb.rpc("is_org_admin_or_manager", { _org: orgId, _user: viewerId });
  if (!isAdmin) throw new Error("Forbidden: staff may not edit own training completion");
}
```

Applies to `markBaselineTrainingComplete`, `attachBaselineCertificate`, `setBaselineExpiration`, and `clearBaselineCompletion`.

### 3. Tiny UX polish
On the row, when no certificate has been uploaded yet, show the "Upload certificate" button prominently (current behavior already places it inline next to "Mark complete" — no layout change needed). When `currentEvidenceDocId` is set, the existing "View cert" + "Edit expiration" controls already render — leave as-is.

## Out of scope
- No schema changes. `staff_baseline_training_completions` already stores `expires_at` + `nectar_suggested_expires`.
- No change to OCR prompt or model.
- No change to the non-baseline (admin-defined) checklist rows.

## Verification
After build: open the employees page for the admin's own profile, confirm each baseline training row shows **Mark complete** + **Upload certificate** on the right, upload a sample CPR PDF, and confirm a toast like "Certificate saved — Nectar read expiration YYYY-MM-DD" appears and the row flips from To-Do to Current with an expiration date.
