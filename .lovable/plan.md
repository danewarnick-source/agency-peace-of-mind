
# eMAR / MAR — capacity & view-selection report (Blake Adams, admin Care tab)

Report only. No code changes proposed.

## 1. What administration models the system actually supports

**Data model (`client_medications`, ~43 cols) — rich, model-agnostic:**
- `is_prn` + `prn_instructions` + `prn_reason` (as-needed meds)
- `is_controlled` + `controlled_schedule` + `pill_count_current` / `pill_count_verified` + second-witness fields + `controlled_med_counts` table + `medication_transfers` table
- `is_rescue` (seizure/emergency meds) with `seizure_duration_seconds`, `seizure_outcome`, `emergency_services_called`
- `route` (PO, topical, IM, SQ, etc.), `dosage`, `frequency`, `scheduled_times[]`
- `packaging`, `pharmacy`, `rx_number`, `prescriber`
- Clinical safety: `purpose`, `adverse_effects`, `side_effects`, `choking_risk`, `contributes_to_swallowing_difficulty`
- Client-level: `self_admin_med_support` (boolean flag), `allergies`, `dysphagia`, `swallowing_alerts`

**`emar_logs` (~38 cols) records:** status (self_administered / refused / omitted / missed / held), exception_reason, pill counts, PRN reason, rescue-med outcome, second-witness signature, medication_error flag, admin_reviewed, addenda (`emar_log_addenda`).

**MarEmarTab (1,959 lines) UI supports:** PRN pass flow (reason required), controlled-substance pass flow (pill count + witness), rescue-med pass flow (seizure duration/outcome/EMS), scheduled-dose pass flow, exception logging, error flagging, controlled counts, transfers ops panel, Nectar advisory.

**BUT — the entire pass surface is scoped to one attestation:**
```
"I confirm I observed or assisted this Person in self-administering
 their own prescribed medication…"
```
Every code path (Chart/Today/Calendar/Directives/History/Ops/Nectar sub-tabs) assumes the Person is the administrator and staff observe/assist. There is **no** nurse-administered mode, no staff-administered (delegated) mode, no separate attestation text, no separate log status, and no branching on administrator role in `emar_logs`. The data model *could* represent nurse/staff administration, but the UI represents only the DOPL/SOW self-directed model.

## 2. Why Blake's view shows only the self-administration interface

The screen you see is **the eligibility gate**, not the eMAR itself:

`src/components/workspace/mar-emar-tab.tsx:1550-1554`
```
if (clientSafety && !clientSafety.self_admin_med_support) {
  return <EmarEligibilityGate client={clientSafety} />;
}
```

`EmarEligibilityGate` (`emar-chart.tsx:230-251`) renders the legal banner, the "eMAR is not enabled for {name} — not flagged as self-directed self-administration" card, and (for admins/managers) a `ClientSafetyEditor` that lets you toggle `self_admin_med_support`. That toggle is the only path in.

So: **Blake is NOT flagged `self_admin_med_support = true`.** Once you flip that flag, the full 7-sub-tab eMAR renders on this same mount. It's "one mode of a fuller eMAR" *only in the sense that the fuller eMAR opens up once the flag is on* — but the fuller eMAR is itself still exclusively the self-directed model (see §1).

## 3. What determines which MAR view a client sees

Single boolean input: `clients.self_admin_med_support`.

Not consulted anywhere in the MAR view decision: PCSP content, `authorized_dspd_codes`, med-monitoring billing codes, nurse-vs-self setting (doesn't exist), org features. `emarEnabled` feature flag and med-monitoring code presence only affect whether the **Care sub-tab is shown** (currently forced `true` from the prior task) — they do not affect what renders inside the tab.

## 4. Nurse-administered / staff-administered path

**Does not exist.** The gate copy references a "nurse-administered medication workflow" as a pointer to something outside the eMAR, but:
- No component, route, table column, or workflow implements it.
- `emar_logs.status` has no nurse/staff-administered value (only self_administered / refused / omitted / missed).
- No second attestation text, no delegated-administration signature capture, no MAR grid designed for staff-as-administrator.
- No RN role, RN credential check, or delegation record anywhere in the codebase.

It is referenced but not built.

## 5. Pharmacy MAR / physician-order upload path

**Parser exists, entry point is orphaned.**
- `src/lib/medications.functions.ts` — `parseMedicationsAI` server fn (AWS Bedrock via gateway) parses image or text of pharmacy/physician orders into structured `medication_name / dosage / frequency / route / scheduled_times / instructions / prescriber`. Wired to Zod, ready to insert.
- `src/components/medications-manager.tsx` (886 lines) — `MedicationsManager` component: full add/edit dialog, "Upload MAR sheet / physician order" import flow that calls `parseAI` and writes to `client_medications`.
- **`MedicationsManager` is not mounted anywhere.** `grep -rn "MedicationsManager" src/` returns only its own definition.
- Neither `MarEmarTab` nor `MedicationChart` exposes an "Add medication" button, an upload button, or a call to `parseMedicationsAI`. `MedicationChart`'s empty state literally says "Add medications from the chart manager" — but the chart manager is unreachable in the UI.

So: the pipeline (upload → parse → populate `client_medications` → active eMAR) is fully built in code but has **no UI entry point** anywhere in the app today. The eMAR can only be populated by direct DB insert.

## 6. Sub-tab capacity on the admin Care mount

Not trimmed. `MarEmarTab` renders the full 7 sub-tabs on every mount (staff workspace and admin Care both):

`Chart` (MedicationChart profiles) · `Today` (pass list) · `Calendar` (MarCalendar) · `Directives` (per-med directives/adversities) · `History` (emar_logs history) · `Ops` (EmarOpsPanel — controlled counts, transfers) · `Nectar` (EmarNectarPanel).

Admin Care mount = staff workspace mount, same component, same gate, same sub-tabs.

---

## Summary map

| Capability | Data model | UI built | UI reachable |
|---|---|---|---|
| Self-directed self-administration (observe/assist) | ✅ | ✅ full 7 sub-tabs | ✅ when `self_admin_med_support = true` |
| PRN meds | ✅ | ✅ | via gate |
| Controlled substances (counts, witness, transfers) | ✅ | ✅ | via gate |
| Rescue / seizure meds | ✅ | ✅ | via gate |
| Multiple routes (PO/topical/IM/SQ/…) | ✅ | ✅ (as data fields) | via gate |
| Nurse-administered workflow | ❌ | ❌ | ❌ (referenced in copy only) |
| Staff-administered / delegated | ❌ | ❌ | ❌ |
| Add medication (manual) | ✅ (`MedicationsManager`) | ✅ | ❌ (component not mounted) |
| Pharmacy/order upload → auto-populate | ✅ (`parseMedicationsAI`) | ✅ (inside `MedicationsManager`) | ❌ (not mounted) |

## What "expand the eMAR" would mean, at a glance

- **To let Blake use the current eMAR:** flip `self_admin_med_support = true` via the editor already rendered on the gate screen (or DB).
- **To let anyone add/upload medications from the UI:** mount `MedicationsManager` inside `MarEmarTab` (e.g. in the Chart sub-tab header) — code exists, just no mount point.
- **To support nurse- or staff-administered meds:** net-new work — new `emar_logs.status` values, a second attestation, an administrator-role branch in the pass flow, and (for RN scope) a delegation/credential record. Not present today.

Awaiting your decision on which of these to open up before making any changes.
