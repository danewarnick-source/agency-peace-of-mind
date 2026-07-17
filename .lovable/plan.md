## Goal
On the staff About tab, stop rendering label/value rows whose value is empty. When an admin later adds the value, it appears automatically.

## Scope
Only `src/components/workspace/about-tab.tsx`. No data-layer or admin-side changes.

## Changes

1. **`Row` becomes hide-when-empty**
   - Currently `Row` always renders and shows an em-dash when the child is null/empty. Change it to return `null` when the value is empty (null, undefined, empty string, or `false` passed in explicitly for "no data").
   - Booleans that carry real meaning (ABI = No, DNR = Off, HR = Not applicable) will be passed as strings so they still render. Empty-only rows disappear.

2. **Groups hide when fully empty**
   - Wrap each group (Person, Support Coordinator, Enrollment, Flags, Additional) so the `GroupHeader` only renders if at least one row in that group has data. Example: if `support_coordinator_name/phone/email` are all null, the "Support Coordinator" header disappears too.

3. **"At a glance" card**
   - Same rule: each row hides if empty; if all four (Primary diagnosis, Primary care, PCSP expiration, Admitted) are empty, hide the whole card.

4. **Enrollment "Discharge date"**
   - Keep the "— active —" italic fallback (that's meaningful state, not missing data).

5. **Emergency Contacts / PCSP / Triggers / Interests cards**
   - Already conditional with friendly empty-state copy. No change.

## Out of scope
- Admin-side profile UI
- Data shape in `client-care-data.functions.ts`
- Custom fields behavior (already only renders when present)
