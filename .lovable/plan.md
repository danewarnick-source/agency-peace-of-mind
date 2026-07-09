## Goal
Route the pre-submit medication check (EVV clock-out + HHS daily note) into the real eMAR logging screen where staff mark each due dose Given / Refused / Missed. Fully delete the shadow `shift_medication_attestations` system — component, table writes, observed/reason/signature UI — since nothing else in the app reads it (the table doesn't even exist in the live DB, so every save has been silently failing).

## What the new check does
Before submit, for the shift window (EVV: clock-in → now; HHS: 00:00 → 24:00 of the record's day):
1. Look up the client's active `client_medications` and expand `scheduled_times` into concrete dose timestamps inside the window (same expansion logic already in `useShiftMedAttestationStatus`).
2. Cross-check `emar_logs` for a matching `(medication_id, scheduled_for)` row in that window (same cross-check already in the hook — this is the single source of truth for "was it logged", used for both EVV and HHS).
3. Three outcomes:
   - **No active meds, or no dose fell in the window** → render nothing, gate is auto-resolved, submit proceeds.
   - **All due doses have an `emar_logs` row** → show a small green "All scheduled doses logged" confirmation, gate resolved.
   - **One or more due doses unlogged** → show the dose list (time · med name · dosage) with "Not yet logged" badges and a primary "Log doses in eMAR" button that opens the client's real MAR tab (`/dashboard/workspace/{clientId}?tab=mar-emar`). Submit is blocked with a toast until every due dose has a Given / Refused / Missed entry.

The real MAR tab (`AdminLogDialog` inside `mar-emar-tab.tsx`) is unchanged — it already writes to `emar_logs` via `logMedicationPass` with Given/Refused/Missed semantics, signature, PRN/controlled/rescue handling, etc. The check just refetches its query on window focus, so returning to the shift/daily-note tab flips the gate green automatically.

## Deletions (shadow system, end-to-end)
- **Delete** `src/components/medications/shift-med-attestation.tsx` — signature canvas, observed yes/no, reason textarea, attestation checkbox all go with it.
- **`src/components/evv/punch-pad.tsx`**: remove the `ShiftMedAttestation`/`emptyMedAttestation`/`MedAttestationValue` imports, the `medAttestation` state, the `ShiftMedAttestationSlot` wrapper component + its JSX slot, and the entire `.from("shift_medication_attestations").insert(...)` block (~lines 1535–1563).
- **`src/routes/dashboard.hhs-hub.$clientId.tsx`**: remove the same imports/state, the `<ShiftMedAttestation>` JSX in `DailyNoteTab`, and the `.from("shift_medication_attestations").insert(...)` block (~lines 447–468).
- No DB migration needed — the table was never created; nothing else in the codebase reads from it (searched: only the three files above touch the name).

## Replacement component & hook
- **Rename** `src/hooks/use-shift-med-attestation-required.tsx` → `src/hooks/use-shift-med-due-status.tsx`. Drop the `tableMissing` probe and `hasActiveMeds`-when-empty short-circuit ambiguity; return `{ loading, scheduledDoses, allDosesLogged, unloggedCount }`. Keep the existing dose-expansion + `emar_logs` cross-check unchanged so EVV and HHS share one detection path.
- **New** `src/components/medications/shift-med-due-check.tsx` — small presentational block: renders nothing when there are no due doses, renders the dose list + "Log doses in eMAR" link when there are, and exposes `allDosesLogged` to the parent via an `onResolvedChange(resolved: boolean)` callback used to drive `canSubmit`.

## Submit-gate wiring
- **punch-pad.tsx**: replace `medAttestationOk` in `canSubmitCompliance` with `medDosesResolved` from the new component; add a `toast.error("Log all scheduled medication doses in eMAR before submitting.")` guard at the top of `submitCompliance` mirroring the existing `triggersResolved` guard.
- **hhs-hub `DailyNoteTab`**: replace the `!medAttestation.resolved` guard in `handleSubmit` with `!medDosesResolved` using the same error copy; remove the post-save shadow insert.

## Verification
- Case A (client with no active meds): both surfaces show no medication block and submit is unblocked.
- Case B (meds exist, none scheduled inside window): same — block hidden, submit unblocked.
- Case C (meds due, none logged): submit blocked, "Log doses in eMAR" opens `/dashboard/workspace/{id}?tab=mar-emar`; logging one dose there via the existing dialog writes to `emar_logs`; returning to EVV/HHS updates the list (React Query refetch on window focus) and once all are logged submit unblocks.
- Confirm via `rg` that no source file still references `shift_medication_attestations`, `ShiftMedAttestation`, `MedAttestationValue`, or `emptyMedAttestation`. Build passes.

## Files touched
- delete: `src/components/medications/shift-med-attestation.tsx`
- rename + trim: `src/hooks/use-shift-med-attestation-required.tsx` → `src/hooks/use-shift-med-due-status.tsx`
- new: `src/components/medications/shift-med-due-check.tsx`
- edit: `src/components/evv/punch-pad.tsx`
- edit: `src/routes/dashboard.hhs-hub.$clientId.tsx`
