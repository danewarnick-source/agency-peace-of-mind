## Defer med logging until Submit Timeclock + orange enabled state

### 1. Shift-med section becomes a draft, not a live writer

`src/components/medications/shift-med-due-check.tsx`

- Remove the `useMutation` that calls `logMedicationPass` on click and the "Log N doses" button.
- Add a new prop `onPendingDosesChange(pending: PendingDose[] | null) => void`. `PendingDose` = the same payload we currently pass to `logMedicationPass` (clientId, medicationId, scheduledFor, scheduledTimeLabel, status, actualTakenAt, exceptionReason, notes, signatureDataUrl), minus anything the parent will fill in.
- Replace the submit button with a **Save** button. Save is enabled under the same validity rules as today (at least one checked dose with a valid outcome/note, typed name, attestation ticked). "No" / "Not scheduled" also count as valid, and emit `onPendingDosesChange([])`.
- After Save, the section collapses into a read-only summary ("3 doses ready to log — signed by <name>") with an **Edit** button that reopens the form and clears the parent's resolved state until Save is pressed again.
- `onResolvedChange(true)` fires only after Save (or after "No" / "Not scheduled"). Reopening via Edit sets it back to `false`.

### 2. Parent stores pending doses and flushes on shift submit

`src/components/evv/punch-pad.tsx`

- Add state `pendingMedDoses: PendingDose[] | null` (default `null`) alongside `medDosesResolved`.
- Wire the `ShiftMedDueCheckSlot` → `ShiftMedDueCheck` `onPendingDosesChange` up to `setPendingMedDoses`.
- In `submitCompliance` / `handleClockOut`, after all existing gates pass but before the timesheet update commits, iterate `pendingMedDoses ?? []` and `await logMedicationPass({ data })` for each entry (status-mapping already lives in `emar-pass.functions.ts`). If any dose insert throws, `toast.error(...)` and abort the timeclock submit so nothing partially commits.
- Reset `pendingMedDoses` in `openCompliance()` alongside the other resets.
- Existing gate `medDosesResolved` stays exactly as-is — it becomes true only after the user clicks Save in the med section.

### 3. Submit Timeclock button — orange when ready

Same file, existing Submit Timeclock button:

- When `canSubmitCompliance && !aiBusy` → orange (`bg-amber-500 hover:bg-amber-600 text-white`), so staff visually see it "wake up" once every section is filled.
- Correction-path variant stays amber (unchanged in meaning).
- Disabled state stays muted.
- Copy stays "💾 Submit Timeclock".

### Out of scope

- `emar_logs` schema and the standalone MAR page — unchanged.
- The HHS daily-note usage of `ShiftMedDueCheck` — it'll get the new Save/Edit UI too, but since that flow has its own submit path, its parent will simply flush `pendingMedDoses` on its own submit (same pattern) in a follow-up if needed. For this change we keep the HHS caller working by defaulting `onPendingDosesChange` to a no-op and continuing to log inline there. (If you'd prefer the HHS flow updated in the same change, say the word.)
