
## Scope

Touch only the Funds → "Billing authorizations (1056)" surface:
- `src/components/clients/billing-codes-detail.tsx` (the per-client card with `CodeRow`)
- `src/routes/dashboard.billing.$clientId.tsx` (the "Full billing editor" table that edits the same rows)

No DB migration. No changes to billing math, unit ledger, EVV/daily-log pulls, submissions, or RLS. Column `client_billing_codes.service_end_date` stays nullable; the requirement is enforced in the UI only. No hard deletes.

## 1. Derived status helper (shared, render-time only)

Add a small helper local to `billing-codes-detail.tsx` (and re-used by the full editor via a tiny export, or duplicated — it's ~10 lines):

```ts
type AuthStatus = "active" | "expired" | "upcoming" | "end-needed";

function getAuthStatus(start?: string | null, end?: string | null): AuthStatus {
  const today = new Date(); today.setHours(0,0,0,0);
  if (!end) return "end-needed";
  const e = new Date(end); if (e < today) return "expired";
  if (start) { const s = new Date(start); if (s > today) return "upcoming"; }
  return "active";
}
```

Badge styles:
- active → green outline
- expired → red/destructive
- upcoming → slate/blue
- end-needed → amber, with inline "Set end date" affordance

## 2. `billing-codes-detail.tsx` — display changes

In the main render (around line 132), split `budgets` by status:

- `currentBudgets` = active + upcoming + end-needed
- `previousBudgets` = expired

Render `currentBudgets.map(...)` as today. Below the list, render a collapsible (shadcn `Collapsible` or a `<details>`) titled `Previous authorizations (N)`, default collapsed, that maps `previousBudgets` with the same `CodeRow` in a read-only variant (pass `readOnly` prop that hides the Edit button and disables the inline date editor added in §3).

In `CodeRow`:
- Add a status badge next to the existing badges (computed from `code.service_start_date`/`service_end_date`).
- Replace the bottom-line `plan window … → …` text to use the real end date when set; when end is null, render `plan window {start ?? "—"} → End date needed` in amber.
- When status is `end-needed` and not `readOnly`, show a compact inline "Set end date" row: a `<Input type="date">` + Save button that PATCHes only `service_end_date` on `client_billing_codes` (validates `> service_start_date`). Re-uses the existing `qc.invalidateQueries` set. Never auto-fill a value.
- When `readOnly`, hide Edit/inline-date-set; everything else renders unchanged so previous authorizations remain auditable.

## 3. Full billing editor (`dashboard.billing.$clientId.tsx`) — validation

In the existing rows table (line ~216) and the new-row row (line ~259):
- Mark the End date input `required`.
- On blur/change, if `!end` or `end <= start`, toast an error and refuse the `upsert`. Keep the input controlled so the bad value isn't persisted.
- Add the same status badge next to each row's code (reusing the helper).
- Optionally segment the table the same way (Current vs Previous authorizations collapsible) — yes, do this for consistency since admins also work here. Same `getAuthStatus` split; previous rows remain editable here (this is the admin's full editor) but render under the collapsed section.

## 4. NECTAR upload flow (§2 guardrail)

In `BudgetUploadButton.handleApply`, when `r.end_date` is missing, still write the row (so rates/units land) but do NOT set `service_end_date`. The row then surfaces as `end-needed` (amber) in the card with the inline prompt — matches the "never fabricate" rule.

## 5. Acceptance / QA

- Editor (both card inline-set and full editor) blocks save without an end date, and rejects `end <= start` with a toast.
- Existing rows with `service_end_date = null` show amber "End date needed" badge + inline "Set end date" prompt; no auto-fill.
- Status badges render correctly for active / expired / upcoming.
- Expired rows disappear from the main list and appear under a collapsible "Previous authorizations (N)" section, read-only on the Funds card, editable (but grouped) in the full editor.
- No deletes anywhere. Unit ledger, rates math, EVV, and submissions untouched.
- `npx tsgo --noEmit` clean; `npm run build` ok; `src/routeTree.gen.ts` unchanged (no new routes).

## Out of scope

- No DB migration (column stays nullable).
- No changes to `client_billing_codes` RLS, the UNIQUE `(organization_id, client_id, service_code)` constraint, or any submission/billing pipeline.
- No edits to host-home or AI-PDF importer flows beyond what §4 specifies inside the Funds card itself.
