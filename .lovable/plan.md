
This is a large multi-system build spanning four distinct compliance domains. I'll scope it into shippable phases so you can review each before the next lands.

## Phase 1 — Database Foundation

New tables (all with org-scoped RLS, admin/manager write, member read where appropriate):

- `client_belongings` — client_id, item_name, description, estimated_value (numeric), inventoried_on, inventoried_by (staff uuid), guardian_signature_data_url, signed_at, status (`active`|`discarded`|`replaced`), discarded_on, discard_reason. Trigger: items with value ≥ $50 cannot move to `discarded` without a non-null `guardian_signature_data_url`.
- `els_usage_ledger` — client_id, service_date, units (int, 1 unit = 15min), shift_id (nullable link). Validation trigger blocks insert if: (a) daily units > 24 for that client/date, or (b) total distinct service_dates in current plan year ≥ 260.
- `respite_stays` — host_home_id (client_id of host), respite_client_id, start_date, end_date. Trigger: rejects rows where (end−start+1) > 14, or where cumulative days for the host in the plan year would exceed 21.
- `pba_accounts` — client_id, opened_on, current_balance (numeric, cached), medicaid_threshold (numeric, default 2000), notes.
- `pba_transactions` — account_id, txn_type (`deposit`|`withdrawal`|`transfer`|`interest`|`debt`|`split_cost`), amount, occurred_on, memo, receipt_url, counterparty, created_by. Validation: amount > $50 requires `receipt_url`.
- `pba_audit_samples` — quarter (date), account_id, assigned_auditor (uuid), status (`pending`|`verified`), verified_at, verifier_notes. Quarterly cron-style RPC `generate_pba_audit_sample()` that picks 10% of active accounts.
- `pba_audit_block` — singleton-per-org flag the dashboard checks to gate UI when pending samples exist.

## Phase 2 — HHS / ELS / Respite UI

New route `/dashboard/dspd-controls` (admin-only) with tabs:
- **Belongings Inventory** — per-client ledger; add item dialog captures value, date, evaluator; discard action opens signature-pad modal for guardian sig (canvas → data URL); items ≥ $50 are visually flagged.
- **ELS Counter Matrix** — per-client annual gauge (units used / 1040 cap = 260 days × 4 units), daily cap meter, recent entries; add-entry form rejects via server error from trigger.
- **Respite Tracker** — calendar list of host home respite stays with consecutive-day and annual-cap badges; create-stay form surfaces trigger violations inline.

## Phase 3 — PBA Trust Ledger

New route `/dashboard/pba-ledger`:
- Account list with balance, Medicaid-threshold warning chip (red when within 10% of cap, amber within 25%).
- Account detail: running ledger table (deposits/withdrawals/etc.), required receipt upload for >$50 (stored in `training-assets` bucket under `pba/{account}/...`).
- **Quarterly Audit Queue** card: lists this quarter's 10% sample; each row shows assigned auditor + "Verify Independently" button (requires current admin ≠ original account creator). Until all are verified, dashboard shows a blocking banner.

## Phase 4 — 360° Compliance Matrix

The existing `ComplianceMatrix` on `/dashboard` already covers shift notes / daily logs / triggered forms / training and has a Reconcile Gaps drawer. I'll extend it to:
- Add a fifth row "Signed eMAR charts" (proxied via `submitted_forms.form_type = 'emar'`).
- Convert the existing card into a denser data-table grid showing one row per staff with per-metric completion %.
- Wire the existing "Send Urgent Nudge" button to deep-link the staff member's mobile alert stream by pinning `client_id` + `service_date` into the existing `staff_nudges` row (fields are already there — surface them in the staff dashboard alert pill).

## Phase 5 — Navigation & Polish

- Sidebar entries: "DSPD Controls" (ShieldCheck), "PBA Trust Ledger" (Wallet) — admin-only.
- TanStack route registrations via file-based routing (auto routeTree update).
- Toasts surface trigger errors in plain language ("Daily ELS cap of 6 hours exceeded").

## Technical notes (for dev review)

- All caps enforced via Postgres `BEFORE INSERT/UPDATE` triggers using `RAISE EXCEPTION` — UI catches and toasts.
- Plan year = calendar year unless an org-level `plan_year_start_month` is later configured (out of scope here; default Jan 1).
- Signature capture uses a small `<canvas>` component (no new deps).
- PBA audit assignment uses `tablesample` for the 10% pick; refreshed manually by admin button + a `pg_cron` job scheduled quarterly.
- Reuses existing `compliance_overrides` / `staff_nudges` tables for matrix reconciliation.

## Confirm before I build

This is roughly 7 new tables, 6 triggers, 3 new routes, 1 matrix refactor, ~8 new components. I'll execute phases 1→5 in order, pausing after Phase 1 (migration) for your approval since it's the foundation. OK to proceed?
