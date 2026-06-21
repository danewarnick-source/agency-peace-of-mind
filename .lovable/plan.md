# Baseline training: verification workflow + RLS fix

## What changes

### 1. Fix the RLS error you saw on upload
The `staff_baseline_training_completions` write policy currently requires `staff_id <> auth.uid()`, which blocks an admin from uploading a certificate on their own profile. New migration loosens that to: write is allowed when the caller is an org admin/manager (via `is_org_admin_or_manager`), regardless of whether the row's `staff_id` is themselves. Non-admins still can't write. The server-fn check already permits this; only the DB policy needs to catch up.

### 2. Add new columns to drive the verify → sign-off workflow
Add to `staff_baseline_training_completions`:
- `nectar_name_match` (text: `match` | `mismatch` | `unreadable` | null) — Nectar's name check result
- `nectar_extracted_name` (text, null) — what Nectar read off the cert
- `nectar_reviewed_at` (timestamptz, null) — when OCR + name match ran
- `admin_signed_off_at` (timestamptz, null) — admin's final sign-off
- `admin_signed_off_by` (uuid, null)

A row is considered **Completed (green)** only when: cert uploaded AND `admin_signed_off_at IS NOT NULL` AND not expired. Otherwise → **Incomplete (red)** (or Expiring/Overdue as today).

### 3. Nectar verifies name on certificate matches employee profile
`attachBaselineCertificate` is extended:
- Pulls the staff's `full_name` from `profiles` (already accessible to caller).
- Updated OCR prompt asks Gemini for BOTH `expires_on` and `name_on_certificate` in one call.
- Normalizes both names (lowercase, collapse whitespace, strip punctuation, optional middle-initial tolerance) and sets `nectar_name_match` to `match` / `mismatch` / `unreadable`.
- Stores `nectar_extracted_name` and `nectar_reviewed_at`.
- Return payload includes the match result so the toast can say e.g. "Cert saved — Nectar verified name (Jane Doe) and read expiration 2028-06-21. Awaiting admin sign-off."

### 4. Remove "Mark complete" entirely; add "Sign off as completed" instead
In `BaselineActions`:
- Delete the "Mark complete" button + inline date form + `markBaselineFn` call site.
- After a certificate exists, show a **Nectar review panel**:
  - "Nectar read expiration: YYYY-MM-DD" (editable)
  - "Nectar name check: ✓ Matches Jane Doe" / "⚠ Mismatch — cert says 'John Q. Doe'" / "⚠ Could not read name"
  - **"Sign off as completed"** button (admin only). Disabled until a cert is attached. On click → new server fn `adminSignOffBaselineCompletion` sets `admin_signed_off_at = now()`, `admin_signed_off_by = userId`. If `nectar_name_match = 'mismatch' | 'unreadable'`, button shows a confirm dialog ("Nectar flagged a name issue — sign off anyway?") before proceeding.
  - **"Revoke sign-off"** button when already signed off.
- The "Upload certificate" button stays. Re-uploading a cert clears `admin_signed_off_at` (re-verification required).

### 5. Status logic + color
`getStaffChecklist` returns a status of `complete` ONLY when `admin_signed_off_at` is set AND (no expiry OR expiry in future). Otherwise:
- cert uploaded, awaiting sign-off → status `in_progress` (UI shows amber "Awaiting sign-off")
- no cert → status `not_started` (UI shows red "Incomplete" — relabeled from current "To do")
- expired → red "Overdue"
Pill labels in the checklist UI map: `current` → green "Completed", `todo` → red "Incomplete", and a new `awaiting_signoff` → amber "Awaiting sign-off".

### 6. Reorder rows so "Ongoing Training (12 Hours)" sits above N/A items
Inside each category, sort rows: applicable first (in their current order), N/A last. Done in the checklist render in `staff-hr-checklist-card.tsx` — no server change.

## Files touched
- new migration: alter `staff_baseline_training_completions` (drop+recreate write policy; add 5 columns)
- `src/lib/staff-training-requirements.functions.ts` — OCR prompt + name match; new `adminSignOffBaselineCompletion` + `revokeBaselineSignOff` server fns; uploading clears sign-off
- `src/lib/hr-staff.functions.ts` — surface new fields in checklist row + sign-off-aware status
- `src/components/hr/staff-hr-checklist-card.tsx` — remove "Mark complete"; add Nectar review panel + sign-off button; new amber "Awaiting sign-off" pill; red "Incomplete" relabel; sort applicable-before-NA

## Out of scope
No changes to non-baseline (admin-defined) requirements, OCR model choice, or HR document storage.
