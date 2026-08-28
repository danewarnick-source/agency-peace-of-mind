import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getTier, formatTierPrice, normalizeTierId } from "@/lib/hive-tiers";
import {
  confirmCheckoutSessionFn,
  createPortalSessionFn,
  createSubscriptionCheckoutFn,
  getBillingStatusFn,
} from "@/lib/stripe-checkout.functions";

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function HiveSubscriptionPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getBillingStatusFn);
  const checkoutFn = useServerFn(createSubscriptionCheckoutFn);
  const portalFn = useServerFn(createPortalSessionFn);
  const confirmFn = useServerFn(confirmCheckoutSessionFn);
  const [busy, setBusy] = useState(false);
  const [pickedPlan, setPickedPlan] = useState<"pro" | "enterprise">("pro");

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
  const planId = normalizeTierId(d?.plan);
  const tier = getTier(planId);
  const activePlan = planId === "enterprise" ? "enterprise" : "pro";

  useEffect(() => {
    setPickedPlan(activePlan);
  }, [activePlan]);

  if (q.isLoading || !d) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
      </div>
    );
  }

  const pay = async (plan: "pro" | "enterprise") => {
    if (!d.organizationId) return;
    setBusy(true);
    try {
      const r = await checkoutFn({ data: { organizationId: d.organizationId, plan } });
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
    ? "Comped"
    : d.lockedAt
      ? "Payment needed"
      : (d.status ?? "unknown").replace("_", " ");

  return (
    <div className="mx-auto max-w-2xl space-y-4" data-testid="hive-subscription-page">
      <header>
        <h2 className="font-display text-xl font-semibold">HIVE Subscription</h2>
        <p className="text-sm text-muted-foreground">
          Your company plan. Pay here to unlock Hive, or manage the card on file.
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
          {d.orgName ?? "This company"} is comped (billing-exempt). Hive stays fully available and
          training extras are not charged. True North Supports is set this way on purpose.
        </div>
      )}

      {!d.paymentsConfigured && !d.billingExempt && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {d.paymentsMessage ?? "Payments are not set up yet. Ask a Hive Executive to add the Stripe test keys."}
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</div>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-display text-2xl font-semibold text-[#0f1b3d]">{tier.name}</div>
          <div className="text-lg font-medium text-[#7a4a0a]">
            {d.billingExempt ? "No charge" : d.mrrCents ? fmtMoney(d.mrrCents) + "/mo" : formatTierPrice(tier)}
          </div>
        </div>
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
          <div className="text-sm font-medium">Choose a plan</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <PlanPick
              active={pickedPlan === "pro"}
              title="Pro"
              price="$499/mo"
              blurb="NECTAR Infusion and HIVE Training included."
              onClick={() => setPickedPlan("pro")}
            />
            <PlanPick
              active={pickedPlan === "enterprise"}
              title="Enterprise"
              price="$1,299/mo"
              blurb="Audit-prep, requirements engine, and priority support."
              onClick={() => setPickedPlan("enterprise")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="pay-with-stripe"
              disabled={busy || !d.paymentsConfigured}
              onClick={() => pay(pickedPlan)}
              className="bg-[#0f1b3d] text-white hover:bg-[#1a2a5a]"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {d.lockedAt || !d.hasStripeCustomer ? "Pay with Stripe" : "Change plan"}
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

function PlanPick({
  active,
  title,
  price,
  blurb,
  onClick,
}: {
  active: boolean;
  title: string;
  price: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border p-3 text-left"
      style={{
        borderColor: active ? "rgba(15,27,61,0.8)" : undefined,
        background: active ? "rgba(15,27,61,0.04)" : undefined,
      }}
    >
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-[#7a4a0a]">{price}</div>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
    </button>
  );
}
