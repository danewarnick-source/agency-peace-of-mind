## Fix medication duplication + add per-med checkbox + typed attestation

Scope: `src/components/medications/shift-med-due-check.tsx` and `src/hooks/use-shift-med-due-status.tsx`. No DB changes.

### 1. Fix duplicate meds

`use-shift-med-due-status.tsx` expands each `scheduled_time` across `dayOffset` [-1, 0, 1] to catch overnight windows. When a shift window is long enough (or straddles midnight), the same medication + time label matches on two different calendar days and appears twice in the list.

Fix: after expansion, dedupe by `medication_id + time_label`, keeping the dose whose `scheduled_for_iso` is closest to the middle of the window. This preserves overnight support without ever showing a med twice for the same shift.

### 2. Per-medication checkbox (opt-in)

In `shift-med-due-check.tsx`, replace the "every unlogged dose must be filled out" model with a checkbox next to each unlogged dose:

- Default: unchecked. Row shows med name, dose, scheduled time, and helper text: "Not administered this shift — will be recorded as not given at this time."
- Checked: reveals the existing Outcome / Time / Note fields for that dose. Only checked rows are validated and submitted to `emar_logs`.
- Already-logged doses continue to show their green "Logged" pill (unchanged).

Nothing is written for unchecked rows — they simply aren't logged from this surface. (The main eMAR remains the source of truth for anything the staff needs to add later.)

### 3. Typed-name attestation (replaces signature pad)

Remove the canvas signature block. Replace with:

- A text input labeled "Type your full name to sign".
- The existing attestation checkbox, with updated copy:
  > "I attest that I personally observed the client take, or administered, each medication I checked above during this shift. Medications not checked were not given at the noted time."
- Submit is enabled only when: at least one dose is checked, every checked dose has a valid Outcome (+ Note if exception), the typed name is non-empty, and the attestation box is ticked.
- The typed name is passed into `logMedicationPass` in place of the drawn signature (server fn already accepts `signatureDataUrl` as a string — we'll send the typed name as plain text; the eMAR log will store the typed attestation instead of a PNG).

### 4. Small copy / flow tweaks

- "Log N dose(s)" button label switches to the count of *checked* doses.
- If the user checks zero doses and clicks submit, show inline hint: "Check the medications you administered, or choose 'No' / 'Not scheduled' above."

### Out of scope

- Admin-side eMAR UI, `emar_logs` schema, and the standalone MAR page — unchanged.
- The HHS daily-note usage of the same component inherits all fixes automatically.
