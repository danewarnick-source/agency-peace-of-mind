## Fix: "Review renewals" button does nothing

### Root cause
The banner CTA calls `scrollToRenewals()`, which scrolls to `#ht-renewals`. But `RenewalsSection` returns `null` when `rows.length === 0` — and `rows` is built from `requiredCourses`, which comes from catalog items' `fulfills_course_ids`. When that mapping is empty (current state), there are zero renewal rows even though 4 staff have no training assigned, so the target element doesn't exist and the click is a no-op.

The banner line is also semantically wrong for that case: "4 staff have no training assigned yet" isn't a renewal — it's an initial purchase/assign.

### Changes (all in `src/routes/dashboard.hive-training.index.tsx`)

1. **Add a scroll target on the Storefront**
   - Wrap the `<Storefront ... />` render in a `<div id="ht-storefront">` (or pass an `id` prop it forwards to its outer section).
   - Add `function scrollToStorefront()` mirroring the other helpers.

2. **Fix the "unassigned" banner line**
   - Change its CTA label from `"Review renewals"` to `"Buy training"`.
   - Change its `onClick` from `scrollToRenewals()` to `scrollToStorefront()`.
   - Rationale: unassigned staff need seats bought + assigned; the Renewals section is for expiring/expired certs, not first-time assignment.

3. **Make `scrollToRenewals()` resilient (keeps the in-progress path safe)**
   - If `#ht-renewals` isn't in the DOM, fall back to scrolling to `#ht-roster`. Prevents the same silent no-op if renewals ever hide again.

### Out of scope
- No changes to `RenewalsSection` logic, `AutoRenewCard`, storefront checkout, edge functions, or DB.
- No change to the in-progress banner ("See team" → roster) — that one works.
- No change to Staff view.

### Verification
- Reload `/dashboard/hive-training` as admin → click **Buy training** in the yellow banner → page smooth-scrolls to the "Programs built for DSPD compliance" storefront.
- When expiring assignments exist later, `#ht-renewals` renders and the fallback is inert.
