# Smart Import rebuild — Prompt 2: unified checklist + type-driven NECTAR asks

## Goal
Replace the stacked, duplicated done-page sections (Needs attention / Finish onboarding / NECTAR questions) with ONE checklist that matches the attached demo, and apply a NECTAR-driven ask pattern (resolution UI varies by ask type) across the done page and the review screen's "NECTAR asks" tab — without modifying `ClientReadinessCard` or `FinishOnboardingCard` (still used on the client profile route).

## What I'll build

### 1. New component — `src/components/clients/import-checklist.tsx`
- Props: `{ clientId: string; jobId: string }`.
- Fetches with `useQuery` reusing existing keys:
  - `clientReadiness({ clientId })`
  - `getClientOnboardingState({ clientId })`
  - `getClientFieldStates({ clientId })`
- Single header: "Setup checklist · N of M done" + progress bar (matches screenshot 5).
- One uniform row component `<ChecklistRow>`: status dot · label · optional current-value chip · right side (green check OR "required" badge) · chevron. Passing rows collapse quietly but remain expandable for edit.

### 2. Group 1 — "Required to go live" (blocks Submit)
Rows, in order:
1. **Clockable service code** — `schedulable`. Expand: chip list of current codes (removable) + a **Select** dropdown sourced from `EVV_SERVICE_CODES` filtered to `isClockableServiceCode`. Writes via existing `client_billing_codes` upsert/delete.
2. **Rate & units per code** — `billable`. Expand: ONE sub-card per current code with Rate ($/unit) + Number of units (annual). Writes `rate_per_unit` and `annual_unit_authorization` per `service_code`. **Linked to row 1**: adding a code in row 1 inserts an empty sub-card here in the same session and flips this row back to incomplete; removing a code removes its sub-card. Shared query key so invalidation keeps them in sync.
3. **PCSP goals captured** — `goalsPresent`.
4. **Staff assigned** — `hasStaff`. Existing assign-staff multiselect.
5. **Guardian confirmed** — `guardianValid`. Guardian form; if extraction left a `guardian_name` candidate, pre-fill with a "NECTAR found a guardian — confirm" hint (this candidate already exists in the data, no new extraction).
6. **Missing required Scope of Work fields** — passing when `CLIENT_PROFILE_FIELDS.filter(f => f.sowRequired && !hasValue)` is empty. Expand lists each missing field by label with an inline input calling `writeProfileFieldValue`. Photograph excluded (PHI deferred).
7. **Medications** — NECTAR ask (data-rich). Required.
8. **Behavior support plan?** — NECTAR ask (data-rich). Required.
9. **Immunization records?** — NECTAR ask (data-rich). Required.
10. **Allergies?** — NECTAR ask (data-rich). Required.
11. Remaining `TRACKED_FIELDS` rendered as NECTAR asks (kind depends on the field — see §4), all required, EXCEPT `housing_voucher` (removed) and `guardian` (covered by row 5).

### 3. Group 2 — "Advanced care / end-of-life (optional)"
Always rendered, starts collapsed, never blocks Submit. Four NECTAR asks (simple yes/no kind unless NECTAR has a finding) writing to prompt-1 columns:
- **DNR** → `clients.dnr_status`. If "Yes / on file", reveals required sub-field "Where is the DNR kept?" → `clients.dnr_location`.
- **POLST** → `clients.polst_status`.
- **Palliative care orders** → `clients.palliative_care_status`.
- **Hospice protocols** → `clients.hospice_status`.

### 4. NECTAR ask pattern (`<NectarAsk>` — type-driven, NOT uniformly three-path)
Each ask carries NECTAR's finding/suggestion (if any) and a `kind` that picks the resolution UI:

| `kind` | When | Resolution UI |
|---|---|---|
| `confident_suggestion` | NECTAR extracted/inferred a likely answer | **Confirm** / **Edit** (Edit opens the manual form pre-filled with the suggestion) |
| `data_rich_gap` | Category that needs structured records (meds, BSP, immunizations, allergies) and NECTAR has no data | **Fill in myself** / **Upload document** / **No / none** |
| `simple_yes_no` | Boolean field NECTAR is silent on (dysphagia, court orders, etc., and the end-of-life group by default) | **Yes** / **No / none** |

Only **data-rich** categories show Upload. Upload behavior in prompt 2 is honest: file goes to existing private storage via the `createSignedUrl` pattern (`incidents.functions.ts` / `referral-docs.functions.ts`), a row is inserted into `client_documents` (`client_id`, `document_type`, `file_name`, `file_url`, `storage_path`), UI shows "📎 [filename] · attached to profile". **The upload does NOT pretend NECTAR read the file** — no auto-prefill, no "NECTAR found" banner on the manual form after upload. After attaching, the manual form opens blank for the admin to fill (extraction wiring lands in prompt 3, and that prompt will switch upload to pre-fill).

"No / none" writes `field_confirmations[key] = "none"` (existing pattern). Confirm writes the suggested value to its field(s).

After answering, ask collapses to one-line summary + Edit link (+ attached filename if uploaded).

Manual forms per category:
- **Medications** (repeatable, "Add another medication") → `client_medications` rows: `medication_name`, `dosage`, `am_pm`, `scheduled_time`, `prescriber`, `support_level` (Self-administers / Self-administers with reminders / Staff assists / Staff administers / Nurse-delegated), `support_explanation` (required).
- **BSP** → `client_documents` row of `document_type='bsp'` + notes fields (target behavior, plan author, de-escalation strategy, review/expiry).
- **Immunizations** (repeatable) → appended to `clients.immunizations`.
- **Allergies** (repeatable) → appended to `clients.allergies`.
- **DNR / POLST / palliative / hospice** → status + (DNR only) location.

Thin new server fns (in `src/lib/import-checklist.functions.ts`, both `requireSupabaseAuth` + org-membership check):
- `upsertClientMedication({ clientId, ...fields })`
- `appendClientArrayField({ clientId, field: 'allergies' | 'immunizations', value })`
- `setEndOfLifeStatus({ clientId, field, status, location? })`
- `attachClientDocument({ clientId, documentType, fileName, storagePath })` (storage upload happens client-side via the existing signed-URL helper).

### 5. EVV geocoding gating — registry-driven (confirmed)
Compute `evvApplicable = currentCodes.some(c => EVV_SERVICE_CODES.find(d => d.code === c)?.evvLock)`. If false, hide the geocoding row and show one note above the list: "NECTAR hid EVV geocoding — no EVV-locked codes." This uses the project's authoritative `EVV_SERVICE_CODES` registry — not a new hardcode, and not the broader `isClockable && !isDayProgram` derivation.

### 6. Submit gating
"Submit for setup" at the bottom of the list (matches screenshot 6). Disabled until every Group 1 row passes; helper text "Answer all required items to submit." Group 2 never blocks. Wires to the existing submit-for-setup server fn already used by `FinishOnboardingCard`.

### 7. Back button
Top-of-page back goes to `/dashboard/smart-import/$jobId/review`, not the uploader.

### 8. Done-page swap (only this file)
In `src/routes/dashboard.smart-import.$jobId.done.tsx` (~lines 292–293), replace `<ClientReadinessCard>` + `<FinishOnboardingCard>` with `<ImportChecklist clientId={s.record_id} jobId={jobId} />`. Remove now-unused imports from THIS file only. **Do not touch** `src/routes/dashboard.clients.$clientId.tsx`, `client-readiness-card.tsx`, or `finish-onboarding-card.tsx`.

### 9. Review screen cleanup — `dashboard.smart-import.$jobId.review.tsx`
- **Placement tab**: render value by type — booleans → "Yes"/"No" (never `{"bool":true}`); `billing_code_row` → `"<CODE> — $<rate>/unit · <units> units"`; everything else → trimmed string. One uniform row style; remove raw-JSON fallback.
- **NECTAR asks tab**: render each question with `<NectarAsk>` using the right `kind`. Where NECTAR's extraction already suggested a value (e.g. dysphagia=true → swallowing alerts), use `confident_suggestion` with Confirm/Edit and label "NECTAR suggests Yes from the PCSP". Explicitly do NOT infer BSP from PBA.

## Files touched
- **New**: `src/components/clients/import-checklist.tsx`, `src/components/clients/nectar-ask.tsx`, `src/components/clients/checklist-row.tsx`, `src/lib/import-checklist.functions.ts`.
- **Edit**: `src/routes/dashboard.smart-import.$jobId.done.tsx`, `src/routes/dashboard.smart-import.$jobId.review.tsx`.
- **Untouched** (verified): `client-readiness-card.tsx`, `finish-onboarding-card.tsx`, `dashboard.clients.$clientId.tsx`, `client-readiness.functions.ts`, `finish-onboarding.functions.ts`, `field-confirmations.ts`, `service-billing.ts`, `evv-codes.ts`.

## Verification before PR
1. `npm run build` green; `src/routeTree.gen.ts` staged.
2. Client profile route still renders the original two cards unchanged.
3. Done page shows ONE list, two groups, no duplicated items, Submit disabled until Group 1 complete.
4. Adding a code in row 1 immediately creates an empty Rate sub-card and flips row 2 to incomplete; removing it cleans up.
5. EVV row hidden for an RHS+DSI-only client (matches screenshot 5 banner).
6. Upload path: file lands in storage + `client_documents` row + "📎 attached" indicator, and the manual form opens BLANK (no fake extraction).
7. Confident-suggestion asks show Confirm/Edit; data-rich gaps show Fill/Upload/None; simple booleans show Yes/None.
8. Review Placement no longer shows `{"bool":true}` or raw JSON for billing codes.

## Not doing in this prompt
- No extraction logic changes — prompt 3.
- No photograph capture (PHI deferred).
- No new DB columns (all live per prompt 1).
- No edits to the client profile cards.
