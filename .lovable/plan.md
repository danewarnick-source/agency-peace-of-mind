
## What's wrong

For Justin Hesse / DSI, the Billing Codes Detail page shows **1,382 used units** but the documented, accurate total is **486 units (121.5 hrs)** — off by ~2.84×.

I traced the discrepancy directly. All 26 "clean" DSI timesheets sum to 111.75 h. One additional row (`c344f737…`) has:

- raw clock-in: `2026-07-07 15:12`
- raw clock-out: `2026-07-17 08:59` (10 days later — bad punch)
- **corrected** clock-in: `2026-07-07 15:12`, **corrected** clock-out: `2026-07-08 01:00`
- `review_status`: `approved`

Effective billable time for that shift is ~9.8 h, but the budget hook is summing the **raw** 233.79 h, which drives the total to 345.5 h × 4 = **1,382 units**.

The bug is in `src/hooks/use-client-budget.tsx`: the hourly-code loop reads `r.clock_in_timestamp` / `r.clock_out_timestamp` directly and never checks `corrected_clock_in/out` or `review_status`. The canonical helpers `effectiveBillingTimes` and `computeBillableEntryUnits` in `src/lib/billing-units.ts` already implement the correct rule ("approved with corrections → use corrected times; needs_review / rejected → exclude") and are used by the rest of the billing math.

## Fix

Update `useClientBudget` (`src/hooks/use-client-budget.tsx`) only:

1. Extend the `evv_timesheets` select to also pull `review_status`, `corrected_clock_in`, `corrected_clock_out`.
2. In the hourly-code accumulator, replace direct `clock_in_timestamp` / `clock_out_timestamp` usage with `effectiveBillingTimes(row)` and `computeBillableEntryUnits(row)` from `@/lib/billing-units`.
   - Skip the row when `effectiveBillingTimes` returns `null` (excluded by review status or missing times).
   - Compute `used_hours` from the effective (in, out) pair, and add `computeBillableEntryUnits(row)` to `used_entry_units`.
3. Leave the daily-code branch untouched (already sourced from `hhs_daily_records_v.billable`).

No UI, no schema, no data change. After the fix, Justin/DSI recomputes to 121.5 h × 4 = 486 units, matching Documentation > Records.

## Verification

- Re-open Billing Codes Detail for Justin Hesse → DSI shows ~486 used units, remaining reflects the true balance.
- Spot-check one other client/code with an `approved` corrected timesheet: used units match Records.
- Confirm clients with only `clean` shifts are unchanged (helper returns raw times when no corrections).
