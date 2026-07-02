## 1. Where "HR Admin" lives today

It's not missing — it just isn't labeled clearly. The Employee Loans tab I added is here:

**Dashboard → Employees hub → "Compliance" tab** (URL: `/dashboard/hub/employees?tab=compliance`, which renders the HR Admin page, and Employee Loans is a sub-tab inside it).

I'll do two things to make it findable:

- **Rename the tab** in the Employees hub from "Compliance" → "HR Admin" so the label matches what you're looking for.
- **Promote "Employee Loans"** to a first-class tab in the Employees hub (Roster · Hosts · HR Admin · **Employee Loans**), so signing loans is one click, not buried two levels deep.

No new routes, no navigation restructure beyond the tab labels.

## 2. Why "Create host" fails

The red toast is a Postgres RLS rejection on `hhp_cue_cards`. The write policy requires the `manage_referrals` permission, and the account you're using doesn't have it in its role — so the insert is blocked before it ever reaches the table.

Hosts aren't really a "referrals" concept for TNS — they're part of the client-placement / HR side. The right fix is to widen the write gate so admins and managers can create/edit host cue cards without needing the referrals permission specifically.

**Fix — one migration + one server-fn line:**

- Update the `hhp_write` RLS policy on `hhp_cue_cards` so it accepts EITHER `manage_referrals` OR `manage_clients` (both are already held by admins/managers by default).
- Update `createHhpCueCard` / `updateHhpCueCard` in `src/lib/hhp-cue-cards.functions.ts` to call `requireAnyPermission([...])` with the same two permissions, so the server-side gate matches the RLS policy.
- Read policy stays the same (view or manage referrals) — this is only the write path.

After this, "New host → Create host" will succeed for you and any other admin/manager without granting a referrals-specific permission.

## Out of scope

- No changes to Host questionnaire, matching, or Whiteboard.
- No role/permission table changes beyond the RLS predicate itself.
- Not touching DocuSign or the Employee Loan e-sign flow.
