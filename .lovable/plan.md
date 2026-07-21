## Authorized Codes: one Edit-all button + per-row Delete

Replace the per-row Edit buttons on the client Billing → Authorized Codes list with a single **Edit** button on the card header that flips the whole list into edit mode. Keep the per-row Delete action.

### Where
`src/components/clients/billing-codes-detail.tsx`

### Changes
- **Remove** the per-row Edit / Manual override button in `CodeRow` (around line 609). Rows no longer own their own edit state.
- **Card header** (active authorizations section) gets:
  - `Edit` button (ghost, pencil icon) — enters bulk-edit mode.
  - In bulk mode it swaps to `Save all` (primary) + `Cancel` (ghost) with a small `N changed` counter.
- **Bulk edit mode**:
  - Every non-readonly row renders its Annual units, Rate/unit, and Service end date inputs inline (reuse the existing input UI already in `CodeRow`).
  - Draft state lives at the parent as `Map<codeId, { annual, rate, endDate }>`, seeded from current values; unchanged entries are skipped on save.
  - Per-row validation (non-negative numbers, end date after start date) mirrors current single-row rules; invalid rows highlight and block `Save all`.
  - `Save all` runs `client_billing_codes` updates in parallel (`Promise.all`) scoped to `organization_id`, then invalidates: `all-client-billing-codes`, `client-billing-codes`, `client-budget`, `client-codes-summary`, `client-readiness`, `caseload`, `scheduler-data`. Toast summarizes `Updated X of Y codes`; failed rows keep their drafts with inline error text.
  - `Cancel` discards drafts and exits bulk mode.
- **Per-row Delete** (from prior plan) stays: Trash2 icon button on each active row, confirm dialog, extra warning when `usedUnits > 0`, deletes the `client_billing_codes` row and strips the code from `clients.authorized_dspd_codes` / `job_code`, then invalidates the same query keys. Hidden while bulk-edit mode is active to avoid competing actions.
- Read-only "Previous authorizations" panel is unchanged.

### Notes
- No schema changes; no server function needed — reuses the browser `supabase` client and existing RLS.
- No dedicated full-page editor route (dropped per feedback).
