## Goal
Before a staff member can finalize clock-out (EVV punch-pad) or a host home can submit the daily note, force a per-client "medication observation" attestation when that client has active medications on file.

## Rules (confirmed)
- **Per-client**: one attestation row per client on the shift who has any row in `client_medications` with `is_active = true`. (Residential shifts with multiple residents = multiple rows.)
- **Always shows if active meds exist** (no schedule-window filtering).
- **Hard block**: staff cannot finalize clock-out and host cannot submit the daily note until each row is answered + signed.
- **eMAR cross-check**: if staff answers "Yes, observed", we require an `emar_logs` entry for every scheduled dose during the shift window before allowing the attestation. If passes are missing, the modal lists them with a "Log this pass" button that opens the existing Observe & Confirm flow. If they answer "No, did not take," that's allowed standalone with a required reason note (≥10 chars).

## UI placement
1. **Staff clock-out (EVV punch-pad)** — `src/components/evv/punch-pad.tsx`: new gate inside the existing Clock-Out compliance dialog, rendered after PCSP/narrative/behavior gates, before the final "Submit & Clock Out" button. `finalizeClockOut()` cannot run until all medication rows are resolved.
2. **Host home daily note** — `src/routes/dashboard.hhs-hub.$clientId.tsx` (the Daily Note panel near line 215+): new section above the existing attestation checkbox; submit button is disabled until the med attestation passes. Single-client context, so always one row.

## New component
`src/components/medications/shift-med-attestation.tsx` — reusable card group used in both places. For each client with active meds:
- Header: client name + pill icon + count of scheduled doses in shift window.
- **Yes / No** segmented control.
- If **Yes**: shows scheduled-doses checklist pulled from `client_medications.scheduled_times` filtered to the shift window; each unmet dose has an inline "Log pass" button opening the existing `PassDialog`/`mar-emar-tab` flow. Row resolves once every scheduled dose in the window has a matching `emar_logs` entry (`medication_id` + `scheduled_for` within window).
- If **No**: required textarea (reason ≥10 chars) + attestation checkbox: *"I attest that {client} did not take any medication during this shift."*
- If **Yes** (after all passes logged): attestation checkbox: *"I attest that I observed and supported {client} with self-administration of their medication(s) during this shift."*
- Signature pad (reused canvas pattern from `dashboard.emar.tsx`).
- Emits `{ clientId, observed: boolean, reason?: string, signatureDataUrl, attestedAt }` per row when complete. Parent enforces "all rows complete" before allowing submit.

## Data
New table to persist the attestation as audit evidence (separate from `emar_logs` so it survives even when there are zero scheduled doses):

```
shift_medication_attestations
  organization_id, client_id, staff_id
  shift_id (nullable — null for HHS host daily note)
  hhs_daily_record_id (nullable — set for host note)
  observed (boolean), reason (text, nullable)
  signature_data_url (text)
  attested_at (timestamptz)
  shift_window_start, shift_window_end (timestamptz)
```
RLS: org-scoped via `is_org_member`; insert by self, read by org admins/managers + own rows. GRANT to authenticated + service_role.

## Helper hook
`src/hooks/use-shift-med-attestation-required.tsx` — given `{ clientIds, windowStart, windowEnd }`:
- Loads `client_medications` (active) for those clients.
- Loads `emar_logs` in window.
- Returns `{ rows: [{ clientId, clientName, hasActiveMeds, scheduledDosesInWindow, loggedDoseKeys, attestationRow? }], allResolved: boolean }`.

## Wiring
- **Punch-pad**: in `finalizeClockOut`, after existing gates and before the `evv_timesheets.update`, insert into `shift_medication_attestations` for each completed row (clientId = `active.client_id`, shift_id = `active.id`, window = `active.clock_in_timestamp` → `clockOut`). Block submit button when `allResolved` is false.
- **HHS daily note**: in the daily-note save path (around line 304+ in `dashboard.hhs-hub.$clientId.tsx`), require the attestation; insert row with `hhs_daily_record_id` after the note saves (or in same transaction via a small server fn `submitDailyNoteWithMedAttestation`).
- If client has **no active meds**, the component renders nothing and `allResolved = true` — zero friction.

## Out of scope
- Multi-client residential coverage shifts on the punch-pad (today's `useActiveShift` is single-client; if/when a shift attaches multiple residents we'll loop the same hook over them).
- Changing existing eMAR pass dialog UI — we reuse it as-is.
- Schedule reconciliation across days; we only check doses scheduled inside the active shift window.

## Files touched
- New: `src/components/medications/shift-med-attestation.tsx`
- New: `src/hooks/use-shift-med-attestation-required.tsx`
- New migration: `shift_medication_attestations` table + RLS + GRANTs
- Edit: `src/components/evv/punch-pad.tsx` (gate before clock-out)
- Edit: `src/routes/dashboard.hhs-hub.$clientId.tsx` (gate before daily-note submit)
- Possibly edit: `src/lib/hhs.functions.ts` to accept the attestation payload in the existing save path
