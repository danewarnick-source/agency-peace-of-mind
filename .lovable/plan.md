## The bug

The warning ("your agency hasn't told HIVE which DSPD service codes it's contracted to bill") is driven by `provider_interest_outline.codes_held` in `fetchTenantIdentity` (`src/lib/service-classification.ts`).

But the **Company Profile** page (`src/routes/dashboard.nectar-company-profile.tsx`) — where the "Services you provide" chips live and where the fix-it link sends the admin — only writes `organizations.services_offered`. It never writes `provider_interest_outline.codes_held`. So the box the admin fills has no effect on the check that produced the warning.

## Fix (two small, contained changes)

1. **`src/routes/dashboard.nectar-company-profile.tsx` — persist the awarded codes where the classifier actually reads them.**
   In `save()`, after the `organizations` update, upsert a row into `provider_interest_outline` (org_id + name='Default') with `codes_held` set to `draft.services` (uppercased). Use the existing `provider-interest-outline.functions.ts` helper (`upsertOutline`) so RLS + defaults are honored, rather than a raw `supabase.from(...)` call.

2. **`src/lib/service-classification.ts` — belt-and-suspenders fallback for orgs that saved services before this fix.**
   In `fetchTenantIdentity`, if `provider_interest_outline.codes_held` is empty, fall back to `organizations.services_offered` (already selected in the same query — just add the column). Uppercase and dedupe. This clears the warning immediately for TNS FAKE and every existing tenant without requiring them to re-save.

Optional polish (say yes/no):
- Add a `codes-held` anchor in the Company Profile page so the "Set awarded codes" deep link (`#codes-held`) actually scrolls to the chips.

## Not changing

- The warning logic itself (`smart-import-review.functions.ts` line 98–105) is still correct — it just now gets the right data.
- No schema change, no migration.
- No changes to referral-matching, billing gates, or classifier partitioning.

## Verification

- Reload the Smart Import review for the current TNS FAKE PCSP → warning should disappear (services_offered already has HHS/SLN/SLH/SEI/DSI/RHS per the screenshot).
- Toggle a chip off in Company Profile, save, re-open review → warning reappears when a PCSP code is outside the awarded set (existing behavior preserved).
