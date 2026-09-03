import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import { isComplimentaryHiveOrg } from "@/lib/current-org";
import { formatUsdFromCents } from "@/lib/hive-pricing";
import { PI_LIST_MINIMUM_LINE, PI_LIST_PRICE_DISPLAY, PI_LIST_PRICE_UNIT, PI_SIGNUP_PRICE_LINE } from "@/lib/pi-landing";
import { quotePiListSubscription } from "@/lib/pi-signup-pricing";
import {
  confirmCheckoutSessionFn,
  createPortalSessionFn,
  createSubscriptionCheckoutFn,
  getBillingStatusFn,
} from "@/lib/stripe-checkout.functions";
import { humanizeCheckoutConfirmError, humanizeCheckoutStartError } from "@/lib/signup-checkout-error";

function fmtMoney(cents: number): string {
  return formatUsdFromCents(cents);
}

export function HiveSubscriptionPanel() {
  const qc = useQueryClient();
  const orgQ = useCurrentOrg();
  const org = orgQ.data ?? null;
  const orgId = org?.organization_id ?? null;
  const statusFn = useServerFn(getBillingStatusFn);
  const checkoutFn = useServerFn(createSubscriptionCheckoutFn);
  const portalFn = useServerFn(createPortalSessionFn);
  const confirmFn = useServerFn(confirmCheckoutSessionFn);
  const [busy, setBusy] = useState(false);
  const [staffCount, setStaffCount] = useState(4);
  const [clientCount, setClientCount] = useState(10);
  const waitingForOrg = orgQ.isPending || (!orgId && orgQ.isFetching);

  // Same resolution as the sidebar. A blank hive.activeOrgId is not "no org."
  useEffect(() => {
    if (!orgId || typeof window === "undefined") return;
    try {
      if (!window.localStorage.getItem("hive.activeOrgId")) {
        window.localStorage.setItem("hive.activeOrgId", orgId);
      }
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["hive-billing-status", orgId],
    queryFn: () => statusFn({ data: { organizationId: orgId } }),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    const checkout = params.get("checkout");
    if (checkout === "cancelled") {
      toast.info("Checkout cancelled. You can pay whenever you are ready.");
    }
    if (!sessionId || checkout !== "success") return;
    let cancelled = false;
    (async () => {
      try {
        const r = await confirmFn({ data: { sessionId } });
        if (cancelled) return;
        if (r.organizationId) {
          try {
            window.localStorage.setItem("hive.activeOrgId", r.organizationId);
          } catch {
            /* ignore */
          }
        }
        if (r.ok) {
          toast.success("Payment received. Your company is unlocked.");
          await qc.invalidateQueries({ queryKey: ["hive-billing-status"] });
          if (!cancelled) window.location.replace("/dashboard");
        } else if (r.error) {
          toast.error(humanizeCheckoutConfirmError(r.error));
        }
      } catch (e) {
        if (!cancelled) toast.error(humanizeCheckoutConfirmError(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmFn, qc, orgId, statusFn]);

  const d = q.data;

  useEffect(() => {
    if (!d) return;
    setStaffCount(d.staffCount || 4);
    setClientCount(d.clientCount || 0);
  }, [d?.staffCount, d?.clientCount]);

  const quote = useMemo(() => {
    if (!d) return null;
    return quotePiListSubscription({ clientCount, interval: "monthly" });
  }, [d, clientCount]);

  if (waitingForOrg) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
      </div>
    );
  }
  if (!orgId) {
    return <div className="text-sm text-muted-foreground">No active organization.</div>;
  }
  if (q.isLoading || !d) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
      </div>
    );
  }

  // TNS is Free/Exempt even if the billing_exempt column is not set yet.
  // Never show a pay button or start Stripe Checkout for that org.
  const complimentary = d.billingExempt || isComplimentaryHiveOrg(org);

  const pay = async () => {
    if (complimentary) return;
    if (!d.organizationId) return;
    setBusy(true);
    try {
      const r = await checkoutFn({
        data: {
          organizationId: d.organizationId,
          staffCount,
          clientCount,
          interval: "monthly",
          pricingModel: "pi_list",
        },
      });
      if (r.exempt) {
        toast.success("This company is comped. No payment needed.");
        await qc.invalidateQueries({ queryKey: ["hive-billing-status"] });
        setBusy(false);
        return;
      }
      if (r.error || !r.url) {
        toast.error(humanizeCheckoutStartError(r.error ?? "Could not start checkout."));
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch (e) {
      toast.error(humanizeCheckoutStartError(e));
      setBusy(false);
    }
  };

  const manage = async () => {
    if (!d.organizationId) return;
    setBusy(true);
    try {
      const r = await portalFn({ data: { organizationId: d.organizationId } });
      if (r.error || !r.url) {
        toast.error(r.error ?? "Could not open billing portal.");
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  const statusLabel = complimentary
    ? "Free / Exempt — never charged"
    : d.lockedAt
      ? "Payment needed"
      : (d.status ?? "unknown").replace("_", " ");

  const rateKind = complimentary ? "Exempt" : "List";

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="hive-subscription-page">
      <header>
        <h2 className="font-display text-xl font-semibold">Subscription</h2>
        <p className="text-sm text-muted-foreground">{PI_SIGNUP_PRICE_LINE}</p>
      </header>

      {d.testMode && (
        <div
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
          data-testid="stripe-test-mode-hint"
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>TEST MODE</strong> — no real charge. Use card{" "}
            <span className="font-mono">4242 4242 4242 4242</span>, any future expiry, any CVC, any ZIP.
          </span>
        </div>
      )}

      {complimentary && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          data-testid="comped-note"
        >
          {d.orgName ?? "This company"} is billing-exempt. Provider Interface never charges this company.
          True North Supports is set this way on purpose. Dane can toggle this in Exec for
          other companies — test orgs are not auto-exempt.
        </div>
      )}

      {!d.paymentsConfigured && !complimentary && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {d.paymentsMessage ?? "Payments are not set up yet. Ask an Exec to add the Stripe test keys."}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Current rate</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-semibold text-[var(--hive-text)]" data-testid="pricing-schedule">
            {rateKind}
          </div>
          <div className="text-lg font-medium text-[#7a4a0a]">
            {complimentary
              ? "No charge"
              : quote
                ? `${PI_LIST_PRICE_DISPLAY} ${PI_LIST_PRICE_UNIT}`
                : PI_LIST_PRICE_UNIT}
          </div>
        </div>
        {!complimentary && quote && (
          <div className="mt-2 space-y-1 text-sm">
            <div>{PI_LIST_MINIMUM_LINE}</div>
            <div>
              Monthly: <span className="font-medium">{fmtMoney(quote.monthlyCents)}</span>
              {quote.minimumApplied ? ` (${fmtMoney(quote.minimumCents)} minimum applied)` : ""}
            </div>
            <div className="text-xs text-muted-foreground">{quote.summaryLine}</div>
          </div>
        )}
        <div className="mt-2 text-sm">
          Status: <span className="font-medium capitalize">{statusLabel}</span>
        </div>
        {d.currentPeriodEnd && !complimentary && (
          <div className="mt-1 text-xs text-muted-foreground">
            Current period ends {new Date(d.currentPeriodEnd).toLocaleDateString()}
          </div>
        )}
      </div>

      {!complimentary && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="text-sm font-medium">Pay for Provider Interface</div>
          <div data-testid="billed-client-count">
            <div className="text-sm font-medium">Billable clients this period</div>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{clientCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              High-water count from your roster — anyone active at any point this month. Staff does
              not change the price. Monthly amount is $69 × this count, or $350, whichever is higher.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Enterprise custom work is not sold here.{" "}
            <Link to="/contact" className="underline">
              Contact us
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="pay-with-stripe"
              disabled={busy || !d.paymentsConfigured}
              onClick={pay}
              className="bg-[var(--hive-text)] text-white hover:bg-[#1a2a5a]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {d.lockedAt || !d.hasStripeCustomer ? "Pay with Stripe" : "Update plan"}
            </Button>
            {d.hasStripeCustomer && (
              <Button variant="outline" disabled={busy || !d.paymentsConfigured} onClick={manage}>
                Manage billing
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
