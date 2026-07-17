## Problem

Historical-import timesheets are inserted with `import_source = 'historical_import'` and `status = 'Pending_Staff_Confirmation'` (`src/lib/smart-import-timesheets.functions.ts`). On the Documentation → Records page, `reviewExceptions()` (`src/lib/records-review-rules.ts`) doesn't know about that state, so those rows trip "Missing/short note", "PCSP goal not checked", and "No clock-out" and land in the red "Needs attention" queue — even though nothing is actionable from admin's side. The real next step is the staff member confirming the entry at `/dashboard/my-historical-timesheets`.

## Fix (records-tab UI only; no schema, no rule engine change)

Edit `src/components/records/records-tab.tsx`:

1. Add `import_source` to `SELECT_COLS` and to the `Row` type.
2. Extend `Derived` with `awaiting_staff_confirmation: boolean`, computed as `import_source === 'historical_import' && status === 'Pending_Staff_Confirmation'`.
3. In the `derivedAll` mapper: when `awaiting_staff_confirmation` is true, set `exceptions = []` (skip `reviewExceptions()` entirely) so these rows do NOT enter the attention set and are not double-flagged as compliance problems.
4. In the "Why flagged / Flags" cell:
   - When `awaiting_staff_confirmation`, render a single neutral badge — slate/muted, `<Clock3 />` icon, label `Awaiting staff confirmation`, tooltip `Imported from a historical spreadsheet — waiting for {staff_name} to review and sign off at My historical timesheets. Nothing to fix here.`
   - Otherwise keep existing `ReasonBadge` list.
5. In the "In → Out" cell (or right after the caregiver name), keep the existing `edited` chip behavior. No other columns change.

Effect: awaiting-confirmation rows disappear from the "Needs attention" tab and its count, still appear under "All records" with the clear neutral label, and admins can see who owes the sign-off without seeing false compliance red flags.

## Files touched

- `src/components/records/records-tab.tsx` — SELECT, `Row`, `Derived`, `derivedAll` mapper, and the flags cell (~20 lines total).

No changes to `records-review-rules.ts`, no DB migration, no impact on EVV export logic (awaiting-confirmation rows keep their existing `is_evv_locked` classification).

## Verification

- Records → Needs attention: no historical-import rows with `Pending_Staff_Confirmation` remain in the list; attention count drops accordingly.
- Records → All records: those rows show the "Awaiting staff confirmation" badge, no red exception chips, and the tooltip explains the next step.
- Live (non-imported) shifts with real missing notes / no clock-out are unaffected.