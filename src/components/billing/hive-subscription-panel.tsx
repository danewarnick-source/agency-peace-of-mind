import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatUsdFromCents,
  quoteHiveSubscription,
  type BillingInterval,
} from "@/lib/hive-pricing";
import {
  confirmCheckoutSessionFn,
  createPortalSessionFn,
  createSubscriptionCheckoutFn,
  getBillingStatusFn,
} from "@/lib/stripe-checkout.functions";

function fmtMoney(cents: number): string {
  return formatUsdFromCents(cents);
}

export function HiveSubscriptionPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getBillingStatusFn);
  const checkoutFn = useServerFn(createSubscriptionCheckoutFn);
  const portalFn = useServerFn(createPortalSessionFn);
  const confirmFn = useServerFn(confirmCheckoutSessionFn);
  const [busy, setBusy] = useState(false);
  const [staffCount, setStaffCount] = useState(4);
  const [clientCount, setClientCount] = useState(10);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  const q = useQuery({
    queryKey: ["hive-billing-status"],
    queryFn: () => {
      let organizationId: string | undefined;
      try {
        organizationId = window.localStorage.getItem("hive.activeOrgId") ?? undefined;
      } catch {
        /* ignore */
      }
      return statusFn({ data: { organizationId } });
    },
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
        if (r.ok) {
          toast.success("Payment received. Your company is unlocked.");
          await qc.invalidateQueries({ queryKey: ["hive-billing-status"] });
        }
      } catch (e) {
        if (!cancelled) toast.error((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [confirmFn, qc]);

  const d = q.data;

  useEffect(() => {
    if (!d) return;
    setStaffCount(d.staffCount || 4);
    setClientCount(d.clientCount || 0);
    setInterval(d.interval === "annual" ? "annual" : "monthly");
  }, [d?.staffCount, d?.clientCount, d?.interval]);

  const quote = useMemo(() => {
    if (!d) return null;
    return quoteHiveSubscription({
      staffCount,
      clientCount,
      schedule: d.pricingSchedule,
      interval,
      foundingEndsAt: d.foundingEndsAt,
    });
  }, [d, staffCount, clientCount, interval]);

  if (q.isLoading || !d) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
      </div>
    );
  }

  const pay = async () => {
    if (!d.organizationId) return;
    setBusy(true);
    try {
      const r = await checkoutFn({
        data: {
          organizationId: d.organizationId,
          staffCount,
          clientCount,
          interval,
        },
      });
      if (r.exempt) {
        toast.success("This company is comped. No payment needed.");
        await qc.invalidateQueries({ queryKey: ["hive-billing-status"] });
        setBusy(false);
        return;
      }
      if (r.error || !r.url) {
        toast.error(r.error ?? "Could not start checkout.");
        setBusy(false);
        return;
      }
      window.location.href = r.url;
    } catch (e) {
      toast.error((e as Error).message);
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

  const statusLabel = d.billingExempt
    ? "Exempt — never charged"
    : d.lockedAt
      ? "Payment needed"
      : (d.status ?? "unknown").replace("_", " ");

  const rateKind = d.billingExempt
    ? "Exempt"
    : quote?.schedule === "founding"
      ? "Founding"
      : "List";

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="hive-subscription-page">
      <header>
        <h2 className="font-display text-xl font-semibold">HIVE Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Per active staff. List rates drop as client count grows. Enterprise is contact-us — no
          public dollar amount.
        </p>
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

      {d.billingExempt && (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          data-testid="comped-note"
        >
          {d.orgName ?? "This company"} is billing-exempt. Hive never charges seats or training.
          True North Supports is set this way on purpose. Dane can toggle this in Hive Exec for
          other companies — test orgs are not auto-exempt.
        </div>
      )}

      {!d.paymentsConfigured && !d.billingExempt && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {d.paymentsMessage ?? "Payments are not set up yet. Ask a Hive Executive to add the Stripe test keys."}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Current rate</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-semibold text-[#0f1b3d]" data-testid="pricing-schedule">
            {rateKind}
          </div>
          <div className="text-lg font-medium text-[#7a4a0a]">
            {d.billingExempt
              ? "No charge"
              : quote
                ? `${fmtMoney(quote.perStaffCents)} / staff`
                : "Per staff"}
          </div>
        </div>
        {!d.billingExempt && quote && (
          <div className="mt-2 space-y-1 text-sm">
            <div>
              Monthly: <span className="font-medium">{fmtMoney(quote.monthlyCents)}</span>
              {quote.minimumApplied ? ` (${fmtMoney(quote.minimumCents)} minimum applied)` : ""}
            </div>
            {quote.interval === "annual" && (
              <div className="text-muted-foreground">
                Billed annually (20% off): {fmtMoney(quote.billedCents)} / year
              </div>
            )}
            <div className="text-xs text-muted-foreground">{quote.label}</div>
            {d.foundingEndsAt && quote.schedule === "founding" && (
              <div className="text-xs text-muted-foreground">
                Founding rate through {new Date(d.foundingEndsAt).toLocaleDateString()}, then list.
              </div>
            )}
          </div>
        )}
        <div className="mt-2 text-sm">
          Status: <span className="font-medium capitalize">{statusLabel}</span>
        </div>
        {d.currentPeriodEnd && !d.billingExempt && (
          <div className="mt-1 text-xs text-muted-foreground">
            Current period ends {new Date(d.currentPeriodEnd).toLocaleDateString()}
          </div>
        )}
      </div>

      {!d.billingExempt && (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="text-sm font-medium">Pay for Hive</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="sub-staff">Active staff</Label>
              <Input
                id="sub-staff"
                type="number"
                min={1}
                max={500}
                value={staffCount}
                onChange={(e) => setStaffCount(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <Label htmlFor="sub-clients">Active clients</Label>
              <Input
                id="sub-clients"
                type="number"
                min={0}
                max={5000}
                value={clientCount}
                onChange={(e) => setClientCount(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={interval === "monthly" ? "default" : "outline"}
              onClick={() => setInterval("monthly")}
            >
              Monthly
            </Button>
            <Button
              type="button"
              variant={interval === "annual" ? "default" : "outline"}
              onClick={() => setInterval("annual")}
            >
              Annual · 20% off
            </Button>
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
              className="bg-[#0f1b3d] text-white hover:bg-[#1a2a5a]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {d.lockedAt || !d.hasStripeCustomer ? "Pay with Stripe" : "Update seats"}
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
