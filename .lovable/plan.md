## Scope
Small UI/formatting change to the billing-codes table on the Smart Import review page (`src/routes/dashboard.smart-import.$jobId.review.tsx`). Field names in the DB already match — the fix is presentation only.

## Changes

### 1. Rate column → dollars with cents
In `BillingRowEditor` (~line 2307):
- Editable input: prefix a `$` adornment; keep `inputMode="decimal"`; on blur, format the stored value to 2 decimals (e.g. `41.50`). Accept `.`, `,`, and up to 2 decimal places. Store as a number (no change to schema).
- Read-only cell (`notOurs` branch, ~line 2309): render as `$41.50` via `.toFixed(2)` with thousands separators; show `—` when null.
- Also apply the `$` formatting to the read-only Rate cell in the Review-tab summary table (~line 2943 area).

### 2. Column headers match PCSP wording
Rename the column headers (~lines 2018–2020) so they mirror the PCSP the user is copying from:
- `Rate` → `Rate ($)`
- `Annual` → `Annual units` (unchanged binding — still `max_units`, which is the PCSP "Units" column)
- `Mo` → `Monthly max units` (unchanged binding — still `monthly_max_units`, the PCSP "Monthly max billable units" value)

Adjust the column widths slightly so the longer headers fit (`Annual` col ~92px, `Mo` col ~110px). No layout change beyond widths.

### 3. No changes to
- Data model, extraction, server functions, or commit logic
- Field mappings (`rate` → `rate_per_unit`, `max_units` → `annual_unit_authorization`, `monthly_max_units` → `monthly_max_units`) — already correct
- Approval-request / "Not my org" flows

## Files
- `src/routes/dashboard.smart-import.$jobId.review.tsx` only.

## Verification
- Type a rate like `41.5` → blur shows `$41.50`; a rate like `41.505` clamps to `$41.51`.
- Empty rate shows `—` (not `$0.00`).
- Column headers read "Rate ($) / Annual units / Monthly max units" and align with PCSP terminology.
- Build passes.