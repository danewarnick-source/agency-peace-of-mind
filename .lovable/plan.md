## Problem

On Step 8, "Provisioning forecast" only lists **DSI** for time clock, even though the client's PCSP also has **SEI** and **HHS** owned by TNS (plus BC2, PBA, PN2, etc. from external providers).

Root cause: the forecast comes only from `provisioning_rules`. The org has exactly one time-clock rule (`service_code = DSI → time_clock`), so only DSI matches. Nothing derives clock provisioning from the client's actual billing codes, and nothing distinguishes EVV vs non-EVV.

## Fix

Auto-derive time-clock entries from the client's OWNED (TNS) billing codes and split them into EVV vs non-EVV — in addition to keeping the existing automation-rule engine.

### `src/lib/smart-import-review.functions.ts` — `computeProvisioningForecast`

For each `client` subject, after computing rule matches:

1. Read all `extracted_fields` rows where `target_field = 'billing_code_row'` for the subject.
2. Parse with existing `parseBillingRowLoose`, then run `partitionCodeRows(rows, tenant)` (both from `service-classification.ts`) — using `fetchTenantIdentity(sb, subj.org_id)`.
3. From `part.ours`, collect unique `service_code` values that are `isClockableServiceCode(code)` (from `service-billing.ts`) — this excludes HHS/PPS/MTP which never produce staff punches.
4. For each such code, synthesize one forecast entry:
   - `target_module`: `time_clock_evv` if `isEvvLockedCode(code)`, else `time_clock_non_evv`
   - `planned_action`: `enable_feature`
   - `state`: `will_create`
   - `reason`: `evvServiceLabel(code)` (e.g. `"SEI — Supported Employment for an Individual"`) + a suffix `(EVV — geofence + UEVV)` or `(non-EVV — payroll/evidence)`
   - `rule_id`: `null`
5. Dedupe against rule-matched entries so DSI isn't listed twice: if a rule already produced a `time_clock*` entry whose reason references the same code, skip the synthesized copy.
6. Insert alongside rule-matched rows into `provisioning_plan` (unchanged shape; `rule_id` nullable — already allowed).

Rows honoring `ownership_ack = 'not_ours'` are already excluded via `partitionCodeRows`. Coordination-only external codes never appear.

### `src/routes/dashboard.smart-import.$jobId.review.tsx` — `ProvisioningPanel`

- Group entries by category: **Time clock — EVV**, **Time clock — non-EVV**, **Other**.
- Prettify labels: map `time_clock_evv` → "Time clock (EVV)", `time_clock_non_evv` → "Time clock (non-EVV)"; render each group under a small header so the differentiation is visible at a glance.
- Existing per-row Select (`will_create` / `draft` / `added_by_admin` / `na`) stays the same.

## Verification

After the change, this client (TNS-owned codes DSI, SEI, HHS) should show:
- **Time clock (non-EVV)**: DSI, SEI (HHS is filtered out — non-clockable host code)
- Other rule-matched modules (daily_logs, med_mgmt, incident_reporting, behavior_plan) unchanged.

A client with e.g. SLH or CMP owned by TNS would additionally show those under **Time clock (EVV)**.

## Out of scope

- No changes to `provisioning_rules` schema, seeded rules, commit flow, or `togglePlanItem`.
- No new migration.
- No changes to billing-codes table, column widths, or the wizard nav.