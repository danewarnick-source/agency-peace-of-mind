import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, Mail } from "lucide-react";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  confirmCheckoutSessionFn,
  createSubscriptionCheckoutFn,
  getBillingStatusFn,
} from "@/lib/stripe-checkout.functions";
import { PI_LIST_MINIMUM_LINE, PI_LIST_PRICE_DISPLAY, PI_LIST_PRICE_UNIT, PI_SIGNUP_PRICE_LINE } from "@/lib/pi-landing";
import { quotePiListSubscription } from "@/lib/pi-signup-pricing";

export const Route = createFileRoute("/billing-locked")({
  head: () => ({ meta: [{ title: "Account locked — Provider Interface" }] }),
  component: BillingLockedPage,
});

function BillingLockedPage() {
  const navigate = useNavigate();
  const statusFn = useServerFn(getBillingStatusFn);
  const checkoutFn = useServerFn(createSubscriptionCheckoutFn);
  const confirmFn = useServerFn(confirmCheckoutSessionFn);
  const [busy, setBusy] = useState(false);
  const [staffCount, setStaffCount] = useState(4);
  const [clientCount, setClientCount] = useState(10);
  const [state, setState] = useState<{
    loading: boolean;
    authed: boolean;
    isAdmin: boolean;
    agencyName: string;
    orgId: string | null;
    testMode: boolean;
    paymentsConfigured: boolean;
    paymentsMessage: string | null;
    lockReason: string | null;
  }>({
    loading: true,
    authed: false,
    isAdmin: false,
    agencyName: "your agency",
    orgId: null,
    testMode: false,
    paymentsConfigured: false,
    paymentsMessage: null,
    lockReason: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }

      const status = await statusFn({
        data: {
          organizationId: (() => {
            try {
              return window.localStorage.getItem("hive.activeOrgId") ?? undefined;
            } catch {
              return undefined;
            }
          })(),
        },
      });
      if (status.billingExempt || !status.accessLocked) {
        if (!cancelled) navigate({ to: "/dashboard" });
        return;
      }

      let activeOrgId: string | null = status.organizationId;
      try {
        activeOrgId = window.localStorage.getItem("hive.activeOrgId") ?? activeOrgId;
      } catch {
        /* ignore */
      }

      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id, role, organizations(name)")
        .eq("user_id", session.user.id)
        .eq("active", true);
      const ms = (memberships ?? []) as Array<{
        organization_id: string;
        role: string;
        organizations: { name: string } | null;
      }>;
      if (ms.length === 0) {
        if (!cancelled) navigate({ to: "/login" });
        return;
      }
      const m = ms.find((x) => x.organization_id === activeOrgId) ?? ms[0];

      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      if (sessionId) {
        const r = await confirmFn({ data: { sessionId } }).catch(() => null);
        if (r?.ok && !cancelled) {
          navigate({ to: "/dashboard" });
          return;
        }
      }

      if (cancelled) return;
      setStaffCount(status.staffCount || 4);
      setClientCount(status.clientCount || 0);
      setState({
        loading: false,
        authed: true,
        isAdmin: m.role === "admin",
        agencyName: m.organizations?.name ?? status.orgName ?? "your agency",
        orgId: m.organization_id,
        testMode: status.testMode,
        paymentsConfigured: status.paymentsConfigured,
        paymentsMessage: status.paymentsMessage,
        lockReason: status.lockReason,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, statusFn, confirmFn]);

  const quote = useMemo(
    () => quotePiListSubscription({ clientCount, interval: "monthly" }),
    [clientCount],
  );

  const pay = async () => {
    if (!state.orgId) return;
    setBusy(true);
    try {
      const r = await checkoutFn({
        data: {
          organizationId: state.orgId,
          staffCount,
          clientCount,
          interval: "monthly",
          pricingModel: "pi_list",
        },
      });
      if (r.exempt) {
        navigate({ to: "/dashboard" });
        return;
      }
      if (r.error || !r.url) {
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch {
      setBusy(false);
    }
  };

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1A2E] px-4 text-white">
        <p className="text-sm text-white/60">Loading account status…</p>
      </div>
    );
  }

  const unpaid = /payment required/i.test(state.lockReason ?? "");

  return (
    <div className="min-h-screen bg-[#0F1A2E] px-4 py-12 text-white" data-testid="billing-paywall">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <div className="mb-6 flex items-center gap-2">
          <PiMark className="h-7 w-7 text-[#f3efe6]" />
          <span className="text-xl font-semibold tracking-tight">Provider Interface</span>
        </div>

        <h1 className="text-2xl font-bold sm:text-3xl">
          {unpaid ? "Finish payment to use Provider Interface" : "Your agency's account is currently locked"}
        </h1>
        <p className="mt-3 text-white/70">
          {unpaid
            ? `${state.agencyName} needs an active Provider Interface subscription before anyone can use the dashboard.`
            : `${state.agencyName}'s account is locked until billing is current.`}
        </p>

        {state.testMode && (
          <div
            className="mt-6 w-full rounded-lg border border-[#F5A524]/40 bg-[#F5A524]/10 px-4 py-3 text-left text-sm text-[#F5A524]"
            data-testid="stripe-test-mode-hint"
          >
            <strong>TEST MODE</strong> — no real charge. Use card 4242 4242 4242 4242, any future
            expiry, any CVC, any ZIP.
          </div>
        )}

        {state.isAdmin ? (
          <div className="mt-8 w-full space-y-3 text-left">
            {!state.paymentsConfigured && (
              <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {state.paymentsMessage ??
                  "Payments are not set up yet. An Exec needs to add the Stripe test keys."}
              </div>
            )}
            <div
              className="rounded-lg border border-white/10 bg-white/5 px-4 py-3"
              data-testid="pricing-schedule"
            >
              <div className="text-xs uppercase tracking-wider text-[#F5A524]">List rate</div>
              <div className="mt-1 text-2xl font-bold">
                {PI_LIST_PRICE_DISPLAY}
                <span className="text-base font-normal text-white/60"> {PI_LIST_PRICE_UNIT}</span>
              </div>
              <p className="mt-1 text-sm text-white/70">{PI_LIST_MINIMUM_LINE}</p>
              <p className="mt-1 text-sm text-white/70">{quote.summaryLine}</p>
              <p className="mt-1 text-xs text-white/50">{PI_SIGNUP_PRICE_LINE}</p>
            </div>
            <label className="text-xs text-white/60">
              Clients
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2 py-2 text-sm text-white"
                value={clientCount}
                onChange={(e) => setClientCount(Number(e.target.value) || 0)}
              />
            </label>
            <Button
              size="lg"
              data-testid="pay-with-stripe"
              disabled={busy || !state.paymentsConfigured}
              onClick={pay}
              className="w-full bg-[#F5A524] text-[#0F1A2E] hover:bg-[#F5A524]/90"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Pay with Stripe
            </Button>
            <Button asChild variant="ghost" className="w-full text-white/80 hover:text-white">
              <Link to="/dashboard/billing/subscription">Open subscription page</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-8 w-full rounded-xl border border-white/10 bg-white/5 px-6 py-5 text-left text-sm text-white/80">
            Please contact your agency administrator to restore access.
          </div>
        )}

        <div className="mt-10 flex items-center gap-2 text-sm text-white/50">
          <Mail className="h-4 w-4" />
          <a href="mailto:support@hive.app" className="hover:text-white">
            support@hive.app
          </a>
        </div>
      </div>
    </div>
  );
}
