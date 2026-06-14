# Records tab refinement

Targeted edits to `src/components/records/records-tab.tsx` only. No other files change. Exception engine, exports, NECTAR search, and the 5-tab Documentation shell are unchanged.

## 1. Replace status strip with a two-way mode toggle

- Remove the 4-button strip (`needs_review`/`pending`/`approved`/`billed`).
- New state: `mode: "attention" | "all"`, default `"attention"`.
- Render a single inline pill group: **Needs attention (N)** · **All records**, with the live attention count as a small badge.
- Drop `RecordStatus` from the row classifier — exceptions are still computed (and still drive the per-row badges in "All records"), but rows are no longer bucketed into approved/pending/billed.

## 2. Fix the filter bug

Root cause: the query was filtered by `derived_status === status` only at the end, so the server filters did re-fetch, but the client filter always collapsed back to the same exception set regardless of selection. New behavior:

- `mode === "attention"` → keep only rows where `reviewExceptions(r).length > 0`.
- `mode === "all"` → keep every fetched row (then narrowed by the inline filters).
- Remove the `status === "approved" | "billed"` server-side `eq("status","Approved")` branch — it's no longer reachable and confused the count.
- Verify by toggling: "Needs attention" returns a strict subset of "All records" and the match count visibly changes.

## 3. Compact filter row + table-first layout

Replace the 3-col grid of labeled filters with one horizontal strip directly above the table:

```text
[Staff ▾] [Client ▾] [Code ▾] [Home/Team ▾] [Date range ▾]   …………   N records · [Export ▾]
```

- Use the existing `CheckboxMultiSelect` for the four entity filters (no label stacking — placeholder text is the label).
- Date range becomes one `Popover` trigger ("Last 30 days" / "Jun 1 – Jun 14") opening a small two-input panel; collapses to a single chip in the row.
- Wrap the strip in `flex flex-wrap gap-2`; on `<md` it collapses behind a single **Filters** button that opens a `Sheet` containing the same controls.
- Drop the surrounding `rounded-lg border bg-card p-3` block so the row is a thin strip; the results table renders immediately below.

## 4. Live filtering, no submit

Already live via React Query keying — keep that. Just confirm every filter (incl. mode and type) is in the `queryKey` and that the "N records match" count derives from the same `rowsQ.data?.rows.length`. No Apply button.

## 5. Type strip — corrected order and meaning

Replace current 4 types with exactly these, in order:

1. **All types** — no code filter from this strip.
2. **EVV timesheets** — codes where `evvLock === true` (SLN, SLH, ACA, CHA, COM, HSQ, PAC, RP2, RP3, CMP, CMS).
3. **Non-EVV timesheets** — every clockable code where `evvLock === false`. RHS stays here (filterable via Service Code = RHS). HHS is excluded from this bucket.
4. **Daily logs (HHS)** — renders the existing `ResidentialDailyTab` filtered/scoped to HHS only (host-home daily records, no clocking). RHS is NOT in this view.

Implementation: `RecordType = "all" | "evv" | "non_evv" | "hhs_daily"`. The `non_evv` bucket = `EVV_SERVICE_CODES.filter(c => !c.evvLock).map(c => c.code)` (includes RHS, DSI, SEI, etc.). The `hhs_daily` branch renders `<ResidentialDailyTab />` — same component already in use; HHS-only scoping is its existing default. RHS punches-not-billable and HHS-no-clock rules are not touched (they live in billing-units / service-billing).

## What stays exactly the same

- `src/lib/records-review-rules.ts` — unchanged.
- Context-aware exports: DHHS EVV CSV button is shown only when every filtered row's code is EVV-locked; Master Agency Ledger CSV always available for the current filter.
- NECTAR search bar position (above the filter row).
- 5 Documentation tabs (Records, Incidents, Forms, Audit, HRC).
- All underlying queries against `evv_timesheets` + `evv_export_records` and existing RLS.

## Explicitly NOT built here (relocate later)

- Unbilled-revenue view → Finances.
- Billed-vs-budget progress (annual/monthly/weekly caps from `client_billing_codes`) → client profile / Finances.

These are noted so they aren't lost; no code added in Records for either.

## Verification before reply

- Toggle Needs attention ↔ All records: counts and rows change.
- Each filter (staff, client, code, home/team, date range) re-queries live.
- Filter strip + table fit above the fold on a 748px-wide viewport (current preview).
- Type strip reads in order: All types · EVV timesheets · Non-EVV timesheets · Daily logs (HHS); selecting Non-EVV with Code=RHS returns RHS punches; Daily logs (HHS) does not show RHS.
- DHHS EVV button hidden when any non-EVV-locked code is present in the result; Master Ledger CSV always exports the current filter.
