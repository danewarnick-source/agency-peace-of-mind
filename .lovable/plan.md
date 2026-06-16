## eMAR — Prompts 2 & 3

Builds on the medication record from Prompt 1. All framing stays "Person self-administers; staff observes/assists" — no "administered" wording in the UI.

---

### Schema additions (one migration)

**`client_medications`** — add:
- `refill_threshold int not null default 7`
- `refill_status text not null default 'ok'` — `'ok' | 'pending'`
- `refill_requested_at timestamptz`, `refill_requested_by uuid`
- `schedule II–IV` is already represented by `is_controlled`; add `controlled_schedule text` (`II|III|IV`) for the count log header
- `is_rescue boolean not null default false` (for seizure rescue gel etc.)

**`emar_logs`** — rename UI status display only; add columns (no rename of existing):
- `actual_taken_at timestamptz` — when the Person actually took it (defaults = `administered_at`)
- `documented_at timestamptz default now()` — when the entry was written
- `late_entry_gap_minutes int generated`
- `service_context text` — "HHS" | "DSI" | "SEI" | "RHS" | "SLN" | "SLH" | "Day Program" (sourced from the active shift)
- `prn_reason` already exists; add `seizure_duration_seconds int`, `seizure_outcome text`, `emergency_services_called boolean`
- Expand status check to keep `administered|refused|omitted|missed|held` (UI labels them "self-administered / refused / omitted / missed").
- Make rows append-only at the data layer: drop the existing `managers update emar` / `managers delete emar` policies; logs become immutable. Corrections go in `emar_log_addenda`.

**`emar_log_addenda`** (new) — dated, signed notes attached to a prior log; never edits the original.
- `emar_log_id`, `organization_id`, `note text`, `staff_id`, `staff_name`, `signature_data_url`, `created_at`

**`controlled_med_counts`** (new) — chain-of-custody count log for Schedule II–IV.
- `medication_id`, `organization_id`, `client_id`, `expected_count int`, `counted_value int`, `variance int generated`, `context text` (`'pass' | 'shift_change'`), `emar_log_id nullable`, `staff_id`, `signature_data_url`, `flagged bool`, `created_at`

**`medication_transfers`** (new) — chain of custody between locations.
- `medication_id`, `client_id`, `organization_id`, `from_location text`, `to_location text`, `quantity int`, `released_by_staff_id`, `released_signature`, `received_by_name text`, `received_signature`, `transferred_at`, `notes`

**Staff med-assist training gate.** Reuse `certifications` (existing). Add a server-side helper `is_med_assist_current(user_id, org_id)` that returns true if the staff has an active certification of a designated type (e.g. cert type code `MED_ASSIST`). Surface used by the logging server fn to block sign-off, and by the UI to disable Confirm.

All new tables: GRANT to `authenticated` + `service_role`, RLS via `is_org_member` / `is_org_admin_or_manager`. Inventory decrement happens server-side in the same server fn that inserts the log (transactional).

---

### Today's Pass (`dashboard.emar.tsx` + new components)

Replace the current flat list with three groups: **Morning / Evening / PRN (as-needed)**. Each med card shows:
- Time window, medication, dose, route, purpose
- Color: green = self-administered logged in window, amber = window approaching/missed and undocumented, red = missed
- Caution chip "May worsen swallowing" when `contributes_to_swallowing_difficulty = true` or `choking_risk = true`
- Controlled badge with current count + "Refill pending" badge when applicable

Group order, PRN section separated. Clinical safety header (allergies, dysphagia, swallowing alerts) from Prompt 1 stays above each client.

---

### Observe & Confirm logging dialog (replaces existing SignatureDialog)

New `<ObserveAndConfirmDialog>` with:
1. **Outcome** radio: *Self-administered · Refused · Omitted · Missed* (these exact labels)
2. **Route** (prefilled from med, editable)
3. **Actual time taken** — time picker, default = now. If chosen time is >15 min before now, show "Late entry — gap will be recorded" and persist both `actual_taken_at` and `documented_at` with `late_entry_gap_minutes`.
4. **PRN reason** (required if `is_prn`)
5. **Rescue med fields** (required if `is_rescue` and outcome = self-administered): seizure duration, outcome, 911 called
6. **Controlled count** (required if `is_controlled`): expected (read-only), counted (input). Mismatch → red alert, inserts a flagged `controlled_med_counts` row.
7. **Medication-error toggle** — when on: error description required, sets `is_medication_error`, drops a notification to org admins, drafts an `incident_reports` row (existing table) tagged "medication_error".
8. **Attestation block** — exact self-administration wording (replaces "five rights"):
   > "I confirm I observed or assisted this Person in self-administering their own prescribed medication, that I verified it matches the prescription's medication, dose, route, and time, and that this record is accurate and complete."
9. **Signature pad** (existing canvas) — required.
10. **Signed by** auto-stamped from `auth.user` (name + id), plus `service_context` resolved from the staff's active shift at submit time. Never a typed name field.

Server fn `logMedicationPass` (auth-required) enforces:
- Caller's med-assist training is current (`is_med_assist_current`). If not → 403 with friendly message; UI disables Confirm and explains why.
- PRN/rescue/controlled fields present when required.
- Inserts `emar_logs`, decrements `pill_count_current`, inserts `controlled_med_counts` when applicable, fires refill alert when count <= threshold, drafts incident on med-error, creates notification to admins.

---

### Audit trail (client workspace)

New tab on `emar-chart.tsx` → **History**. Chronological, append-only timeline of all `emar_logs` + `emar_log_addenda` for the client, newest-first toggle. Shows refusal-then-success sequence intact. Each entry: staff name, exact time, service context, status pill, signature thumbnail. "Add addendum" button on each entry opens a small signed-note dialog.

UI never offers Edit or Delete on `emar_logs`. RLS enforces it.

---

### Monthly MAR sheet

New route `dashboard.emar.monthly.$clientId.tsx` (or tab on the chart). Grid: medications rows × days-of-month columns. Cell states: ✓ self-administered, R refused, O omitted, M missed, — not scheduled. Today's column highlighted. Month picker.

---

### Inventory & refill alerts

- Decrement on confirmed self-administration (server fn).
- Admin refill panel (new component on `dashboard.admin.emar-audit.tsx` and on the client chart): lists meds at/below `refill_threshold`, "Mark ordered" → sets `refill_status='pending'`. Staff dialog shows "Refill pending from pharmacy" badge.

---

### Controlled-substance enforcement

- Pass dialog requires count entry for any `is_controlled` med (every pass).
- Shift-change prompt: new banner in `today-shift-banner.tsx` flow on shift start/end asking the staff to verify counts for any controlled meds for clients on their caseload; submits `controlled_med_counts` rows.
- Variance → red alert + row flagged for admin review.

---

### Medication transfers

New `MedicationTransferDialog` + list on client chart "Transfers" sub-tab. Captures from/to, quantity, releaser (auto from auth + signature), receiver (typed name + signature pad for the receiving person on the same device). Records only — no inventory math beyond logging.

---

### Nectar helper (eMAR)

New `<EmarNectarPanel>` on the client chart using the existing `gatewayFetch` / Bedrock setup (same pattern as `medications.functions.ts`). Buttons:
- "Show refusal → later success timeline" — runs SQL filter over `emar_logs`, asks Nectar to narrate a before/after for a chosen med/day.
- "Controlled-substance count history" — surfaces `controlled_med_counts` rows with variances highlighted.
- "Swallowing-risk meds" — lists meds with `contributes_to_swallowing_difficulty` or `choking_risk` and any documented incidents.
- "Documentation gap check" — flags missed/undocumented scheduled doses in the last 30 days.

All Nectar output is advisory and marked "Draft — review before relying on this," per project rules.

---

### Out of scope (untouched)

Scheduler, forms feature, EVV, billing logic, existing client/staff tables (no renames, no field removals), `medications-manager.tsx` form schema (additions only via Prompt 1's migration are already in place — this plan only adds *new* columns/tables listed above).

---

### Verification

- Migration applies; types regenerate.
- Today's Pass shows color-coded windows and caution chips against real client/med data.
- Logging dialog blocks PRN without reason, rescue without seizure details, controlled without count, and untrained staff entirely.
- Confirmed log creates row + decrements inventory + (when triggered) creates incident + notifies admin.
- No Edit/Delete on logs in UI or via RLS; addenda are appendable and shown in order.
- Monthly grid renders all 28–31 days with correct cell states; today highlighted.
- Transfer log persists with both signatures.
- Nectar panel returns drafts marked as advisory; no fabricated data.