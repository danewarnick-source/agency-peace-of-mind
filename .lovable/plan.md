
# Medication / MAR / eMAR — full codebase inventory (report only)

No changes. Complete landscape for designing the MAR Command Center.

---

## 1. Every med-related file (mounted vs. orphaned)

### Core eMAR — MOUNTED
| Path | Role | Reachable from |
|---|---|---|
| `src/components/workspace/mar-emar-tab.tsx` (1961 lines) | `MarEmarTab` — 7 sub-tabs: Chart / Today / Calendar / Directives / History / Ops / Nectar. Inline `MarCalendarView` (own copy, not the standalone file). Own pass-flow dialog for PRN / controlled / rescue. Renders `EmarEligibilityGate` when client not flagged self-admin. | admin client profile Care tab, staff workspace, HHS hub eMAR sub-tab |
| `src/components/workspace/emar-chart.tsx` | Exports `EmarLegalBanner`, `useClientSafety`, `ClinicalSafetyHeader`, `EmarEligibilityGate`, `MedicationProfileCard`, `MedicationChart` (read-only profile grid). | Consumed inside MarEmarTab |
| `src/components/workspace/emar-ops-panel.tsx` | `EmarOpsPanel` — refill workflow, controlled shift-change counts, medication transfers. | Ops sub-tab of MarEmarTab |
| `src/components/workspace/emar-nectar-panel.tsx` | `EmarNectarPanel` — Nectar helper (refusal→success, controlled history, swallowing-risk meds, doc-gap check). | Nectar sub-tab of MarEmarTab |
| `src/components/medications-manager.tsx` | `MedicationsManager` — add/edit/discontinue meds + `AIImportDialog` (calls `parseMedicationsAI`, review-before-save). | **Now mounted** in MarEmarTab Chart sub-tab (last task) for admin/manager |
| `src/components/medications/shift-med-attestation.tsx` | Per-client med observation attestation block (clock-out + HHS daily note gate). Depends on `shift_medication_attestations` table (probes for existence, degrades gracefully). | EVV punch-pad clock-out; HHS hub daily note |
| `src/hooks/use-shift-med-attestation-required.tsx` | `useShiftMedAttestationStatus` — expands `scheduled_times` into dose windows, cross-checks `emar_logs`. | shift-med-attestation.tsx |
| `src/lib/emar-pass.functions.ts` | Server fns: `logMedicationPass`, `addEmarAddendum`, `logMedicationTransfer`, `setRefillStatus`, `logShiftChangeCount`. | MarEmarTab, EmarOpsPanel, `/dashboard/emar` route |
| `src/lib/emar-nectar.functions.ts` | Server fn `emarNectarHelper` (Bedrock-backed advisory). | EmarNectarPanel |
| `src/lib/medications.functions.ts` | Server fn `parseMedicationsAI` (physician order / MAR / pharmacy printout → structured meds). | MedicationsManager |
| `src/lib/emar-status.ts` | `EmarStatus` union + label map: `self_administered`, `refused`, `omitted`, `missed`. | eMAR, audit, `/dashboard/emar` |

### Standalone / partial UIs — MIXED
| Path | Role | Mount status |
|---|---|---|
| `src/routes/dashboard.emar.tsx` (~514 lines) | Org-wide "Today's Pass" screen — lists due doses across staff's shifts, opens a pass dialog. Only handles self-admin clients (queries `self_admin_med_support = true`). | **Route exists at `/dashboard/emar`; no nav link anywhere.** URL-reachable orphan. |
| `src/routes/dashboard.admin.emar-audit.tsx` | Admin audit table over `emar_logs` w/ filter + CSV export, RequirePermission `manage_users`. | **Route at `/dashboard/admin/emar-audit`; no nav link.** URL-reachable orphan. |
| `src/routes/dashboard.shift.$shiftId.tsx` (lines ~440–520) | Per-shift MAR grid writing to `shift_mar_entries` (separate table from `emar_logs`). Simple given/refused/missed/held buttons; no attestation, no controlled/PRN/rescue flow. | Reachable when opening a scheduled shift. **Parallel MAR path — does not touch `emar_logs`.** |
| `src/components/mar-calendar.tsx` | Standalone `MarCalendar`. | **ORPHAN — 0 importers.** MarEmarTab uses its own inline `MarCalendarView`. |

### Ancillary references (mounted, non-writing) — telemetry / dashboards
- `src/components/agency-health-snapshot.tsx`, `src/routes/dashboard.command-center.tsx` (lines 1004–1020, 1794–1838) — read `emar_logs` where `is_medication_error = true` for the med-error card.
- `src/routes/dashboard.clients.$clientId.tsx` — the Care sub-tab mount (from prior task).
- `src/routes/dashboard.workspace.$clientId.tsx` — staff workspace mount of `MarEmarTab`.
- `src/routes/dashboard.hhs-hub.$clientId.tsx` — HHS hub eMAR sub-tab mount of `MarEmarTab` (gated by `emarEnabled`).
- `src/routes/dashboard.host-home-control.tsx`, `.hive-exec.*` — feature/subscription toggles referencing "eMAR".
- `src/components/ai-pdf-importer.tsx`, `src/components/nectar/authoritative-source-drop.tsx`, `src/lib/smart-import-*.functions.ts`, `src/lib/document-extraction.ts`, `src/lib/client-face-sheet.functions.ts`, `src/lib/client-import-schema.ts` — NECTAR bulk PCSP import auto-fills med fields on the client profile.
- `src/hooks/use-tenant-features.tsx` — maps URLs `/dashboard/emar` → `emar_pass`, `/dashboard/admin/emar-audit` → `emar_audit` for feature-flag gating.
- Landing / pricing copy (`landing/*`, `pricing.tsx`, `dspd-pricing.tsx`) — marketing references only.

### Migrations that shaped the eMAR (chronological, key ones)
`20260521181404`, `20260521222529`, `20260521233256`, `20260524175956`, `20260525030431`, `20260526074052`, `20260526080709`, `20260528210458`, `20260531201216`, `20260602215012`, `20260603060147`, `20260607013605`, `20260608204225`, `20260609030848`, `20260609082052`, `20260616000828`, `20260616003316`, `20260616070428` (adds `clients.self_admin_med_support`), `20260616072412`, `20260616100000_emar-phase-2b-controlled-substance.sql`, `20260630024522`, `20260701221054`, `20260701223453`.

---

## 2. Tables & columns

### `client_medications` (41 cols)
Identity / schedule: `id, organization_id, client_id, medication_name, dosage, frequency, route, scheduled_times[], scheduled_time, am_pm, instructions, prescriber, start_date, end_date, is_active, discontinued_at, discontinued_by, created_at, created_by, diagnosis, purpose`.
Safety: `adverse_effects, side_effects, choking_risk, choking_risk_details, packaging, contributes_to_swallowing_difficulty`.
Class flags: `is_controlled, controlled_schedule, is_prn, prn_instructions, is_rescue`.
Inventory / refill: `pill_count_current, pill_count_updated_at, pharmacy, rx_number, refill_date, refill_threshold, refill_status, refill_requested_at, refill_requested_by`.
**Administration-model fields:** `support_level` (free-text; live values today: `reminder`, `full_assist`, `NULL`), `support_explanation` (free-text). **No column names the administrator role** (nurse vs staff vs self); nothing keyed to RN credentials.

### `emar_logs` (38 cols)
`id, organization_id, client_id, medication_id, scheduled_for, scheduled_time_label, administered_at, status, exception_reason, notes, staff_id, staff_name, signature_attestation, created_at, is_prn, prn_reason, is_controlled, pill_count_verified, pill_count_value, is_medication_error, error_description, admin_reviewed, admin_reviewed_by, admin_reviewed_at, admin_review_notes, signature_data_url, provider_id, variance_note, attestation_signed, recorded_in, actual_taken_at, documented_at, late_entry_gap_minutes, service_context, seizure_duration_seconds, seizure_outcome, emergency_services_called, second_witness_id`.
**Status values live in DB:** `administered`, `refused`, `missed`, `held` (code layer normalizes to `self_administered / refused / omitted / missed`).
**Administrator role:** not stored. `staff_id/staff_name` is the observer under the self-admin model; there is no `administered_by_role`, `nurse_id`, `rn_id`, `delegated_by`, or `credential_id`.

### `emar_log_addenda` (8 cols)
Append-only notes on an `emar_logs` row: `emar_log_id, note, staff_id, staff_name, signature_data_url`.

### `controlled_med_counts` (15 cols)
`context, expected_count, counted_value, variance, flagged, staff_id, staff_name, signature_data_url, notes` — shift-change and audit counts.

### `medication_transfers` (15 cols)
`from_location, to_location, quantity, released_by_staff_id, released_by_name, released_signature, received_by_name, received_signature, transferred_at` — chain-of-custody.

### `shift_mar_entries` (13 cols)
`scheduled_shift_id, evv_timesheet_id, client_medication_id, staff_id, scheduled_time, status, administered_at, notes` — **parallel** MAR track owned by the per-shift screen. Not merged with `emar_logs`. Status values are free-text (`given/refused/missed/held`).

### `hhs_emar_logs_deprecated` (24 cols)
Retired HHS-only eMAR — schema present, no code path reads or writes it.

### `shift_medication_attestations`
Referenced by `shift-med-attestation.tsx` (probed via HEAD; component degrades to "pending database update" if absent). Not present in current schema query — either not yet migrated or migrated after inventory snapshot; treat as latent.

---

## 3. Administration-model coverage

| Model | Data | UI built | Reachable |
|---|---|---|---|
| Self-directed self-admin (observe/assist) | ✅ `clients.self_admin_med_support`, `client_medications.support_level`/`support_explanation` (free-text), `emar_logs.status='self_administered'` + `signature_attestation` | ✅ full MarEmarTab pass flow (PRN / controlled / rescue paths) | ✅ once client flagged `self_admin_med_support=true` |
| PRN | ✅ `is_prn`, `prn_instructions`, `prn_reason` | ✅ | via self-admin gate |
| Controlled substances | ✅ `is_controlled`, `controlled_schedule`, `pill_count_*`, `second_witness_id`, `controlled_med_counts`, `medication_transfers` | ✅ Today pass flow + Ops panel | via self-admin gate |
| Rescue / seizure | ✅ `is_rescue`, `seizure_duration_seconds`, `seizure_outcome`, `emergency_services_called` | ✅ | via self-admin gate |
| Staff-observed (mechanical assist) | Same as self-admin (single attestation text). No distinct model. | Same as self-admin | Same |
| **Staff-administered / delegated (non-nurse)** | ❌ no columns, no status value | ❌ | ❌ referenced in gate copy only |
| **Nurse-administered (LPN/RN)** | ❌ no `nurse_id`, no credential link, no distinct status | ❌ | ❌ referenced in gate copy only |
| **RN delegation** | ❌ no delegation record, no scope-of-practice check | ❌ | ❌ |
| Per-shift MAR (given/refused/missed/held, no attestation, no PRN/controlled/rescue depth) | ✅ `shift_mar_entries` | ✅ inside `dashboard.shift.$shiftId.tsx` | ✅ when opening a shift — **parallel to `emar_logs`; the two never reconcile** |

Prior report confirmed at whole-codebase scope: nurse / delegated / staff-administered paths are truly absent — no orphaned partner-built implementation exists anywhere in `src/`, `supabase/functions/`, or migrations.

---

## 4. Entry points inventory

| Entry point | Route | Component | State |
|---|---|---|---|
| Admin client profile → **Care** → MAR/eMAR sub-tab | `/dashboard/clients/$clientId` | `MarEmarTab` (gated by `self_admin_med_support`) | **Mounted** |
| Staff workspace client screen | `/dashboard/workspace/$clientId` | `MarEmarTab` | **Mounted** |
| HHS hub client screen → **eMAR** sub-tab | `/dashboard/hhs-hub/$clientId` | `MarEmarTab` (gated by `emarEnabled` feature) | **Mounted** |
| Per-shift screen → MAR section | `/dashboard/shift/$shiftId` | Inline `ShiftMARSection` writing `shift_mar_entries` | **Mounted (parallel track)** |
| EVV clock-out gate | via `punch-pad` | `ShiftMedAttestation` | **Mounted** |
| HHS daily note gate | via `hhs-hub` | `ShiftMedAttestation` | **Mounted** |
| Org-wide "Today's Pass" | `/dashboard/emar` | `EmarPage` | **URL-reachable, no nav link** (orphan surface) |
| Admin eMAR audit | `/dashboard/admin/emar-audit` | `AuditPage` (`RequirePermission manage_users`) | **URL-reachable, no nav link** (orphan surface) |
| Standalone `MarCalendar` component | — | `mar-calendar.tsx` | **0 importers — ORPHAN component** |
| Deprecated HHS eMAR table | `hhs_emar_logs_deprecated` | — | Dead |

---

## 5. SOW medication support levels & billing codes

From `src/lib/evv-codes.ts`, `src/lib/client-features.ts`, `public.service_codes`, and scheduler catalogs — the med-related billing footprint is:

| Code | Name | Category | EVV | Notes |
|---|---|---|---|---|
| **PM1** | Medication Monitoring — **LPN** | nursing | no | Utah DSPD "Professional Medication Monitoring" tier 1 |
| **PM2** | Medication Monitoring — **RN** | nursing | no | Tier 2 |
| **PN1** | Professional Nursing I | nursing | no | General nursing; medication administration falls under RN scope of practice |
| **PN2** | Professional Nursing II | nursing | no | Higher-acuity nursing |

`med_monitoring` feature bucket (`client-features.ts:13`) groups `PM1, PM2, PN1, PN2`. Progress-summary excludes (`progress-summaries.ts:17`) list `PM1, PM2` alongside ELS/MTP/PBA/RP because they are professional-service overlays, not habilitative time.

No dedicated DSPD "medication administration" code exists — administration itself is done under nursing scope (PN1/PN2) or, for self-directed clients, staff observation is not separately billable and rides on the base residential / DSP code.

### Support-level values already in `client_medications.support_level`
Free-text column, current live values: `reminder`, `full_assist`, `NULL`. There is no enum, no reference table, no UI picker — it is being set by import/legacy path only. Design opportunity: promote to an enum tied to administrator role (self / observed / staff-administered / LPN-monitored / RN-administered / delegated).

---

## 6. Med-population pipeline status

- **`parseMedicationsAI`** (`src/lib/medications.functions.ts`) — Bedrock-backed physician-order / MAR / pharmacy-printout parser. Emits `{ medication_name, dosage, frequency, route, scheduled_times[], instructions, prescriber }`. **Built.**
- **`MedicationsManager` + `AIImportDialog`** (`src/components/medications-manager.tsx`) — add/edit/discontinue meds; upload flow calls `parseMedicationsAI`, shows editable review table, commits with `bulkInsertMut`. **Built.**
- **Reachability:** as of the previous task, mounted at the top of MarEmarTab's Chart sub-tab for admin/manager roles. Prior to that it was orphaned (0 importers). Now: **reachable from every mount of `MarEmarTab`** — admin Care tab, staff workspace, HHS hub — for admin/manager only.
- **Alternate populate path:** NECTAR PCSP bulk import (`ai-pdf-importer.tsx` + `smart-import-*.functions.ts` + `client-import-schema.ts` + `document-extraction.ts`) can auto-fill meds during whole-profile ingestion. Independent of the MedicationsManager path.

---

## Design implications for a MAR Command Center

Existing surfaces to consolidate under one client-level "MAR Command Center":

1. **MarEmarTab** (Chart / Today / Calendar / Directives / History / Ops / Nectar) — the eMAR core.
2. **MedicationsManager** — the only add/upload/parse surface.
3. **shift_mar_entries** per-shift MAR (currently parallel and unreconciled with `emar_logs`) — decide: fold into `emar_logs` with a `source='shift'` marker, or keep as a shift-scoped view onto the same log.
4. **`/dashboard/emar` (Today's Pass)** — currently orphan; either link into the Command Center as an "All Doses Due" org lens or retire.
5. **`/dashboard/admin/emar-audit`** — currently orphan; surface as the Command Center's "Audit" sub-tab.
6. **`ShiftMedAttestation`** — the clock-out / daily-note gate; keep as a cross-cutting attestation that reads Command Center state.
7. **Orphan `src/components/mar-calendar.tsx`** — delete or replace MarEmarTab's inline `MarCalendarView` with it.

Gaps the Command Center must close to represent every SOW model:

- `emar_logs` needs an `administrator_role` (self / staff_observed / staff_administered / lpn / rn) and a `credential_id` link (nullable) — enum, not free-text.
- `client_medications.support_level` needs to become an enum with the same value set; back-fill `reminder`/`full_assist` into it.
- `emar_logs.status` should add a `given` value distinct from `self_administered` so staff/nurse administrations are not shoehorned into the self-directed attestation.
- Second attestation text for non-self-admin models; wire it through `logMedicationPass`.
- Optional: `medication_administration_orders` (RN delegation records) linking a med, an RN credential, delegated staff, scope, and expiry.

None of these gaps are being closed in this turn — this is landscape only.
