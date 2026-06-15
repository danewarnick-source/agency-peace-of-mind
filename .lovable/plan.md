## Goal

Make the "Authorized DSPD billing codes" card on the client profile **editable** by admins (multi-select + save). Selections write to `client_billing_codes` (the single source of truth) — the existing DB trigger keeps `clients.job_code` / `authorized_dspd_codes` in sync, so scheduling, time clocks, EVV, today-shift, and the Billing tab all stay aligned automatically.

Only the one card changes. No business logic, rate logic, or EVV gating changes.

## What changes

### 1. Replace `AuthorizedCodesMirror` with an editable picker (`src/routes/dashboard.clients.tsx`)

The component currently shows read-only chips. Replace with:

- `DspdCodesMultiSelect` (already imported, already used in the Care directory dialog) — admin-only via `RequirePermission perm="manage_users"`.
- Initial value = current authorized codes derived from `client_billing_codes` (same `billingCodes` array the header chips use).
- Dirty-state **Save** + **Cancel** buttons appear once the selection differs from saved.
- Below the picker, keep the existing `BillingCodesDetail` table so admins can still edit rate / annual cap / dates per code.

### 2. Save behavior — writes to `client_billing_codes`

On Save, diff `selected` vs `current`:

- **Codes added** → INSERT a minimal `client_billing_codes` row per code:
  - `client_id`, `organization_id`, `service_code`
  - `service_start_date = today`, `service_end_date = null`
  - `unit_type` defaulted from the code's catalog entry (quarter-hour vs day vs visit) via existing `service_codes` lookup
  - `rate_per_unit`, `annual_unit_authorization`, `weekly_cap_units`, `monthly_max_units` left null — flagged with a yellow "Needs 1056 details" badge in the BillingCodesDetail table so finance fills them in before billing.
- **Codes removed** → soft-close the active row(s) for that code: `service_end_date = today`. Do **not** hard-delete (preserves historical billing / EVV references).
- Same-code re-add after a close → INSERT a new row with today as start; old closed row remains for history.

Wrapped in a single `Promise.all` then `queryClient.invalidateQueries` for `client-billing-codes`, `client-profile`, header chips, and Billing tab.

### 3. Trigger does the rest (already deployed)

The migration from the previous turn (`sync_client_authorized_codes_from_billing`) recomputes `clients.job_code` and `clients.authorized_dspd_codes` from active `client_billing_codes` rows on every INSERT/UPDATE/DELETE. So as soon as Save completes:

- Header chips refresh.
- Scheduling, EVV punch pad, today-shift, caseload, whiteboard (all the legacy-array consumers) see the new code list on next refetch.
- Billing tab shows the new rows.

### 4. Care directory dialog (`DspdCodesMultiSelect` at line 2751)

Out of scope to remove, but its save path currently writes directly to `clients.job_code` — that write is now **redundant** (trigger overwrites it). Leave it alone in this change to avoid scope creep; flag for a follow-up to either remove that field from the dialog or rewire it to `client_billing_codes` the same way. Note the user can already see and edit codes via the new profile-card editor.

## Verification

1. Open Johnny → Care tab → "Authorized DSPD billing codes" card now shows the multi-select pre-populated with DSI / HHS / SEI / SLH / SLN.
2. Add `DSG` → Save → row appears in BillingCodesDetail with "Needs 1056 details" badge; header chips update; `clients.job_code` includes `DSG` (trigger).
3. Remove `SEI` → Save → its `client_billing_codes` row's `service_end_date` = today; header chips drop `SEI`; trigger removes it from `job_code`.
4. EVV punch pad / scheduling dropdown for Johnny reflects the new code list (reads `clients.job_code`, kept in sync by trigger).

## Files touched

- `src/routes/dashboard.clients.tsx` — replace `AuthorizedCodesMirror` with editable `AuthorizedCodesEditor` (multi-select + save + diff logic).

No migration, no new tables, no changes to billing math or EVV rules.