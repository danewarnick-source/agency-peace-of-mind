import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CreditCard, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePaymentMethodFn } from "@/lib/billing-payment-method.functions";

type Subscription = {
  id: string;
  organization_id: string;
  locked_at: string | null;
  past_due_since: string | null;
  card_expires_at: string | null;
  last_payment_error: string | null;
};

type BannerKind =
  | "locked"
  | "past_due_critical"   // day 21-29
  | "past_due_warn"       // day 8-20
  | "past_due_soft"       // day 1-7
  | "card_expiring_7"
  | "card_expiring_30"
  | null;

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function computeBanner(sub: Subscription | null): { kind: BannerKind; daysPastDue: number; daysToExpiry: number | null; expiryDate: string | null } {
  if (!sub) return { kind: null, daysPastDue: 0, daysToExpiry: null, expiryDate: null };

  if (sub.locked_at) return { kind: "locked", daysPastDue: 0, daysToExpiry: null, expiryDate: null };

  let daysPastDue = 0;
  if (sub.past_due_since) {
    daysPastDue = Math.max(0, daysBetween(new Date(sub.past_due_since), new Date()));
  }

  let kind: BannerKind = null;
  if (daysPastDue >= 21) kind = "past_due_critical";
  else if (daysPastDue >= 8) kind = "past_due_warn";
  else if (daysPastDue >= 1) kind = "past_due_soft";

  let daysToExpiry: number | null = null;
  let expiryDate: string | null = null;
  if (sub.card_expires_at) {
    const exp = new Date(sub.card_expires_at);
    daysToExpiry = daysBetween(new Date(), exp);
    expiryDate = exp.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

    if (kind === null) {
      if (daysToExpiry <= 7 && daysToExpiry >= 0) kind = "card_expiring_7";
      else if (daysToExpiry <= 30 && daysToExpiry >= 0) kind = "card_expiring_30";
    }
  }

  return { kind, daysPastDue, daysToExpiry, expiryDate };
}

interface Props {
  organizationId: string;
  isAdmin: boolean;
}

export function BillingBanner({ organizationId, isAdmin }: Props) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    enabled: isAdmin && !!organizationId,
    queryKey: ["org-subscription-banner", organizationId],
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from("org_subscriptions")
        .select("id, organization_id, locked_at, past_due_since, card_expires_at, last_payment_error")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Subscription | null) ?? null;
    },
    refetchInterval: 5 * 60_000,
  });

  const banner = useMemo(() => computeBanner(query.data ?? null), [query.data]);

  if (!isAdmin || !banner.kind) return null;

  const onSaved = async () => {
    await qc.invalidateQueries({ queryKey: ["org-subscription-banner", organizationId] });
    setModalOpen(false);
  };

  return (
    <>
      <BannerView
        kind={banner.kind}
        daysPastDue={banner.daysPastDue}
        daysToExpiry={banner.daysToExpiry}
        expiryDate={banner.expiryDate}
        onAction={() => setModalOpen(true)}
      />
      <UpdatePaymentMethodModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        organizationId={organizationId}
        onSaved={onSaved}
      />
    </>
  );
}

function BannerView({
  kind, daysPastDue, daysToExpiry, expiryDate, onAction,
}: {
  kind: Exclude<BannerKind, null>;
  daysPastDue: number;
  daysToExpiry: number | null;
  expiryDate: string | null;
  onAction: () => void;
}) {
  const cfg = (() => {
    switch (kind) {
      case "locked":
        return {
          tone: "bg-red-600 text-white border-red-700",
          icon: <Lock className="h-5 w-5 shrink-0" />,
          title: "Your account is locked due to non-payment.",
          body: "Update your payment method immediately to restore access for you and your staff.",
          cta: "Update payment method",
        };
      case "past_due_critical": {
        const daysLeft = Math.max(1, 30 - daysPastDue);
        return {
          tone: "bg-red-600 text-white border-red-700",
          icon: <AlertTriangle className="h-5 w-5 shrink-0" />,
          title: `Urgent — your account locks in ${daysLeft} ${daysLeft === 1 ? "day" : "days"} due to a failed payment.`,
          body: "Your staff will lose all access if not resolved.",
          cta: "Update payment method now",
        };
      }
      case "past_due_warn":
        return {
          tone: "bg-amber-500 text-[#0F1A2E] border-amber-600",
          icon: <AlertTriangle className="h-5 w-5 shrink-0" />,
          title: `Payment required — your account is ${daysPastDue} ${daysPastDue === 1 ? "day" : "days"} past due.`,
          body: "Update your payment method to avoid a service interruption.",
          cta: "Update payment method",
        };
      case "past_due_soft":
        return {
          tone: "bg-amber-400 text-[#0F1A2E] border-amber-500",
          icon: <AlertTriangle className="h-5 w-5 shrink-0" />,
          title: "Payment failed — we'll retry automatically.",
          body: "Update your payment method if your card details have changed.",
          cta: "Update payment method",
        };
      case "card_expiring_7":
        return {
          tone: "bg-amber-400 text-[#0F1A2E] border-amber-500",
          icon: <CreditCard className="h-5 w-5 shrink-0" />,
          title: `Your card on file expires on ${expiryDate}.`,
          body: "Update it now to avoid a payment failure.",
          cta: "Update card",
        };
      case "card_expiring_30":
        return {
          tone: "bg-yellow-100 text-yellow-900 border-yellow-300",
          icon: <CreditCard className="h-5 w-5 shrink-0" />,
          title: "Your card on file expires soon.",
          body: `Update it before ${expiryDate} to keep your service uninterrupted.${daysToExpiry != null ? ` (${daysToExpiry} days)` : ""}`,
          cta: "Update card",
        };
    }
  })();

  return (
    <div className={`flex items-start gap-3 border-b px-4 py-3 md:px-6 ${cfg.tone}`}>
      {cfg.icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{cfg.title}</div>
        <div className="text-xs opacity-90">{cfg.body}</div>
      </div>
      <Button
        type="button"
        onClick={onAction}
        size="sm"
        className="shrink-0 bg-white text-[#0F1A2E] hover:bg-white/90 border border-white/40"
      >
        {cfg.cta}
      </Button>
    </div>
  );
}

function UpdatePaymentMethodModal({
  open, onOpenChange, organizationId, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  onSaved: () => void | Promise<void>;
}) {
  const updateFn = useServerFn(updatePaymentMethodFn);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [zip, setZip] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setError(null);
    }
  }, [open]);

  const parseExp = (raw: string): { month: number; year: number } | null => {
    const cleaned = raw.replace(/\s/g, "");
    const m = cleaned.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
    if (!m) return null;
    const month = parseInt(m[1], 10);
    let year = parseInt(m[2], 10);
    if (m[2].length === 2) year += 2000;
    if (month < 1 || month > 12) return null;
    return { month, year };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const digits = card.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) {
      setError("Enter a valid card number.");
      return;
    }
    const last4 = digits.slice(-4);
    const parsedExp = parseExp(exp);
    if (!parsedExp) {
      setError("Enter expiry as MM/YY.");
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      setError("CVC must be 3 or 4 digits.");
      return;
    }
    if (!name.trim()) {
      setError("Cardholder name is required.");
      return;
    }
    if (!zip.trim()) {
      setError("ZIP / postal code is required.");
      return;
    }

    setSubmitting(true);
    try {
      await updateFn({
        data: {
          organization_id: organizationId,
          cardholder_name: name.trim(),
          last4,
          exp_month: parsedExp.month,
          exp_year: parsedExp.year,
          postal_code: zip.trim(),
        },
      });
      toast.success("Payment method updated");
      await onSaved();
      // reset
      setName(""); setCard(""); setExp(""); setCvc(""); setZip("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update payment method");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Update payment method
          </DialogTitle>
          <DialogDescription>
            Your service is restored as soon as your card is updated. Card details are sent securely and never stored.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pm-name">Cardholder name</Label>
            <Input id="pm-name" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-card">Card number</Label>
            <Input
              id="pm-card"
              autoComplete="cc-number"
              inputMode="numeric"
              placeholder="1234 5678 9012 3456"
              value={card}
              onChange={(e) => setCard(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-exp">Expiry (MM/YY)</Label>
              <Input
                id="pm-exp"
                autoComplete="cc-exp"
                inputMode="numeric"
                placeholder="12/29"
                value={exp}
                onChange={(e) => setExp(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-cvc">CVC</Label>
              <Input
                id="pm-cvc"
                autoComplete="cc-csc"
                inputMode="numeric"
                placeholder="123"
                value={cvc}
                onChange={(e) => setCvc(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-zip">ZIP / Postal code</Label>
            <Input id="pm-zip" autoComplete="postal-code" value={zip} onChange={(e) => setZip(e.target.value)} required />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save card"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
