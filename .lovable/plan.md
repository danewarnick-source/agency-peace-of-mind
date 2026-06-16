## Scope (Prompt 1 only)
Build the **medication record** and **where it lives**. No scheduler/forms changes. No placeholder clients/staff/meds — pull from real `clients` + `client_medications`.

Aligns to DHHS SOW b/d: Person self-administers, staff observe/assist. Only enabled for clients flagged as self-directed self-administration support.

## 1. Schema additions (single migration)

`clients` — clinical safety fields:
- `allergies text[] not null default '{}'`
- `dysphagia boolean not null default false`
- `swallowing_alerts text[] not null default '{}'` (e.g. "Confirm upright posture", "Crushed-med policy applies")
- `self_admin_med_support boolean not null default false` — gates whether eMAR applies to this client

`client_medications` — SOW-required documentation fields:
- `packaging text` (e.g. "Pharmacy blister pack", "Unit-dose card")
- `side_effects text` (distinct from `adverse_effects` which already exists; side_effects = everyday, adverse_effects = signs of adverse reaction)
- `contributes_to_swallowing_difficulty boolean not null default false`

Existing fields reused: `purpose`, `adverse_effects`, `choking_risk`, `choking_risk_details`, `dosage`, `route`, `scheduled_times`, `instructions`, `pharmacy`, `rx_number`, `pill_count_current`.

No grant/RLS changes — both tables already configured.

## 2. Client record: Medications section

Replace `src/components/workspace/mar-emar-tab.tsx` (already mounted in `dashboard.workspace.$clientId.tsx` and `dashboard.hhs-hub.$clientId.tsx`) with new component composition:

- **Eligibility gate**: if `client.self_admin_med_support === false`, render a notice: "This client is not on a self-directed self-administration support plan. The eMAR does not apply. Use the nurse-administered medication workflow." + admin toggle to enable.
- **Permanent legal banner** (top, sticky within tab): "Self-directed administration support — per Utah DOPL & DHHS SOW, staff are limited to mechanical assistance, instruction, and direct observation of the Person's independent self-administration. Not professional nursing administration."
- **Clinical safety header**: client name, active service (from `authorized_dspd_codes` / current `teams.setting`), allergies as visible chips (red if any, green "No known allergies" if empty array but not null), choking/swallowing alerts panel when `dysphagia || swallowing_alerts.length`.
- **Medication profile list** — one card per active `client_medications` row showing: name + purpose, route, dosage, schedule (slots), side effects, adverse reaction signs, swallowing-difficulty flag, packaging, pharmacy, rx#, refill/pill-count status.
- **Completeness flags**: any med missing `purpose`, `packaging`, `adverse_effects`, `route`, or `dosage` shows an amber "Incomplete — admin to complete" pill listing the missing fields. Admins get an inline "Edit" affordance opening the existing medication editor (reuse `medications-manager.tsx` dialog logic; extend its form with the new fields).
- Keep the existing eMAR-log/today's-pass tab/calendar inside this component — those already work; we're only swapping the **chart** view.

Edit `clients` editor (existing client intake / about tab) to expose: allergies (chip input), dysphagia toggle, swallowing alerts (multi-line list), `self_admin_med_support` toggle.

## 3. Today's Pass (staff daily workflow)

`src/routes/dashboard.emar.tsx` already exists. Refactor:
- Add the same **permanent legal banner** at the top.
- Restrict to clients on the staff member's **own caseload + today's scheduled shift**: intersect `scheduled_shifts` for `staff_id = auth.uid()` covering today with the meds query (already org-scoped; add `.in('client_id', todayClientIds)`).
- Skip clients where `self_admin_med_support !== true`.
- Group due doses by client with the per-client safety header (allergies chips, choking alert) above that client's doses, so staff see the safety context before recording the pass.
- Keep existing 5-Rights attestation dialog and `emar_logs` insert untouched.

Admins (managers / org admins) keep the existing "all today's doses" view; staff get the scoped view. Use `is_org_admin_or_manager` check via existing `usePermissions` hook.

## 4. Files

New / modified:
- `supabase/migrations/<ts>_emar_self_admin_fields.sql` — column additions above.
- `src/components/workspace/mar-emar-tab.tsx` — rewrite to chart described in §2 (keep existing today/calendar subtabs).
- `src/components/medications-manager.tsx` — extend med editor form with `packaging`, `side_effects`, `contributes_to_swallowing_difficulty`.
- `src/components/workspace/about-tab.tsx` (or the existing client edit surface) — add allergies / dysphagia / swallowing alerts / self_admin toggle fields.
- `src/routes/dashboard.emar.tsx` — banner + caseload+self-admin scoping.

Untouched: scheduler, forms, all client/staff table renames or removals.

## 5. Verification
- Migration applies, types regenerate.
- Workspace tab renders gate when flag off, full chart when on; allergies visible; incomplete-field flags appear when fields blank.
- Today's Pass for a staff account only lists clients on today's shift with self-admin flag true; admin account sees all.
- No console errors; no sample data anywhere (every list driven by real Supabase queries).
