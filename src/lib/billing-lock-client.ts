/**
 * Client-side unpaid-org lock. beforeLoad skips on SSR (no window/session),
 * so DashboardLayout also runs this after hydrate.
 *
 * Lock truth comes from getBillingLockFn (admin-backed org_subscriptions),
 * not a browser REST read. RLS only lets org admin/manager SELECT that table,
 * so a client query returns "no row" after a successful pay and fail-closes.
 */

import { getBillingLockFn } from "@/lib/billing-lock.functions";
import { parseCheckoutReturnSearch } from "@/lib/billing-access";

export { BILLING_LOCK_ALLOWLIST, pathBypassesBillingLock } from "@/lib/billing-access";

export function checkoutReturnFromLocation(search: string): ReturnType<typeof parseCheckoutReturnSearch> {
  return parseCheckoutReturnSearch(search);
}

export async function orgDashboardIsLocked(opts: {
  userId: string;
  activeOrgId?: string | null;
}): Promise<{ locked: boolean; isAdmin: boolean; orgId: string | null }> {
  void opts.userId;
  try {
    const r = await getBillingLockFn({
      data: { organizationId: opts.activeOrgId ?? undefined },
    });
    return { locked: r.locked, isAdmin: r.isAdmin, orgId: r.orgId };
  } catch {
    // Match dashboard beforeLoad: fail open on unexpected errors so a just-paid
    // org is not trapped if the lock fn cannot run. Unpaid orgs re-lock on the
    // next successful check.
    return { locked: false, isAdmin: false, orgId: opts.activeOrgId ?? null };
  }
}
