import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pathBypassesBillingLock } from "./billing-access.ts";

function read(url: URL): string {
  return readFileSync(url, "utf8");
}

describe("billing-lock-client", () => {
  it("login and lock gate persist True North over leftover test agencies", () => {
    const login = read(new URL("../routes/login.tsx", import.meta.url));
    assert.match(login, /persistPreferredOrgFromRows/);
    assert.match(login, /resolveCurrentMembership/);
    const dash = read(new URL("../routes/dashboard.tsx", import.meta.url));
    assert.match(dash, /persistActiveOrgId/);
  });

  it("lets admins open the subscription page while locked", () => {
    assert.equal(pathBypassesBillingLock("/dashboard/billing/subscription", true), true);
    assert.equal(pathBypassesBillingLock("/dashboard/billing/subscription", false), false);
    assert.equal(pathBypassesBillingLock("/dashboard", true), false);
  });

  it("dashboard gate uses the lock fn, not a browser org_subscriptions read", () => {
    const client = read(new URL("./billing-lock-client.ts", import.meta.url));
    assert.match(client, /getBillingLockFn/);
    assert.doesNotMatch(client, /\.from\("org_subscriptions"\)/);
    const lock = read(new URL("./billing-lock.functions.ts", import.meta.url));
    assert.match(lock, /readSupabaseAdminEnv/);
    assert.match(lock, /context\.supabase/);
    assert.match(lock, /pickUnlockedMembership/);
    assert.match(lock, /isComplimentaryMembership/);
  });

  it("billing-locked confirms Checkout before deciding to stay", () => {
    const page = read(new URL("../routes/billing-locked.tsx", import.meta.url));
    const confirmAt = page.indexOf("confirmFn");
    const stayAt = page.indexOf("setState({");
    assert.ok(confirmAt > 0 && stayAt > confirmAt, "confirm must run before the paywall renders");
    assert.match(page, /parseCheckoutReturnSearch/);
    assert.match(page, /navigate\(\{ to: "\/dashboard"/);
    assert.match(page, /billing-lock-org-switcher/);
    assert.match(page, /billing-lock-sign-out/);
    assert.match(page, /pickUnlockedMembership/);
    assert.match(page, /isComplimentaryMembership/);
  });

  it("Checkout success returns to the app with session_id so the gate can unlock", () => {
    const checkout = read(new URL("./stripe-checkout.functions.ts", import.meta.url));
    assert.match(
      checkout,
      /success_url: `\$\{origin\}\/dashboard\?checkout=success&session_id=\{CHECKOUT_SESSION_ID\}`/,
    );
    assert.match(checkout, /organizationId: orgId/);
    assert.match(checkout, /activateSubscriptionFromCheckout/);
  });
});
