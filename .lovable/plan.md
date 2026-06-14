## Approved EVV Archive — Plan

### Where
New sub-tab inside Documentation → **EVV & timesheets**, alongside the existing Compliance Desk and the collapsible Reconciliation panel. Tab key: `archive`, label: **Approved EVV Archive**. Admin/manager gated via existing `is_org_admin_or_manager` (same RLS already on `evv_timesheets` and `evv_export_records` — no new policies needed).

No changes to approval flow, billing math, Utah DHHS export, or reconciliation logic. Read-only over existing rows.

### Data source (read-only)
- Base: `evv_timesheets` filtered by `organization_id` + `status = 'Approved'` (the verified/billable set).
- Billing status derived per row by left-joining `evv_export_records` (timesheet_id):
  - **Billed** — has any export record (latest batch wins for display).
  - **Held** — `review_status` in (`needs_review`, `rejected`) OR `incident_flag = true` OR `denial_reason` present. (Approved-but-intentionally-not-billable.)
  - **Unbilled** — Approved, not Held, no export record.
- Joins for display: `clients(first_name, last_name, team_id, utah_medicaid_member_id)`, `profiles(staff_id → first_name, last_name)`, `teams(team_name)`.

### Filters (combinable, URL search-param backed via zod)
1. Staff — `CheckboxMultiSelect` (reuse `src/components/ui/checkbox-multi-select.tsx`), multi.
2. Client — same component, multi.
3. Service code — multi, options from distinct codes in the org's approved timesheets.
4. Date range — from/to date pickers on `clock_in_timestamp` (shadcn Popover+Calendar with `pointer-events-auto`).
5. Home / team — multi, from `teams` (filters by `clients.team_id`).
6. Billing status — segmented control: All / Billed / Unbilled / Held.

Search params: `staff[]`, `client[]`, `code[]`, `team[]`, `from`, `to`, `billing`. Defaults: previous full week, billing=All.

### Result table columns
Caregiver · Client · Service code · Date · Clock in/out (show corrected vs raw when `is_edited_by_admin`) · Duration (hh:mm) · Geofence (in-bounds / out-of-bounds with variance) · Billing status badge.

Row click → opens existing shift detail at `/dashboard/shift/$shiftId` in a new tab (no new detail screen built).

Pagination: server-side, 100/page, ordered by `clock_in_timestamp desc`.

### CSV export
"Download CSV" button exports the **currently-filtered** set (re-runs the same query without pagination, capped at 10,000 rows for safety with a toast warning if exceeded). Columns mirror the table plus Member ID. Filename: `approved-evv-archive_<from>_<to>.csv`. Reuses `downloadCsv()` helper from `src/lib/utah-evv-export.ts`. Not the DHHS format — plain human-readable audit CSV.

### Files
- **New** `src/routes/dashboard.evv-archive.tsx` — route component (the screen itself, exported also as `EvvArchiveWrapped` for hub embedding). Holds query, filter UI, table, CSV.
- **Edit** `src/routes/dashboard.hub.documentation.tsx` — add `archive` tab under EVV area, render `<EvvArchiveWrapped />`. Extend the tab zod enum.
- **No** new tables, migrations, RLS, or server functions. All reads via the browser `supabase` client under existing RLS.

### Acceptance check before reply
- Tab visible only to admin/manager (gate with `useCurrentOrg` role check + hide tab otherwise).
- All five filters + billing status filter combine; URL reflects state; refresh preserves view.
- Billing status badges render correctly against `evv_export_records` for a known billed and unbilled shift.
- CSV downloads the exact filtered set with the listed columns.
- Row click opens shift detail; no approval/billing/DHHS/reconciliation code paths touched (grep diff to confirm).
