import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CreditCard,
  Lock,
  CheckCircle2,
  XCircle,
  Beaker,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePaymentMethodFn } from "@/lib/billing-payment-method.functions";
import {
  adminRecordPaymentSuccessFn,
  adminRecordPaymentFailureFn,
  adminLockAccountFn,
  adminUnlockAccountFn,
  adminSimulateCardExpiryFn,
} from "@/lib/billing-admin.functions";
import { getBillingSmsPhone, updateBillingSmsPhone } from "@/lib/billing-sms.functions";
import { formatUSPhonePretty, isValidUSPhone, normalizeUSPhoneToE164 } from "@/lib/us-phone";

export const Route = createFileRoute("/dashboard/settings/subscription")({
  head: () => ({ meta: [{ title: "HIVE Subscription — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_billing">
      <SubscriptionPage />
    </RequirePermission>
  ),
});

// ============================================================================
// Types
// ============================================================================

type Subscription = {
  id: string;
  organization_id: string;
  plan: string | null;
  status: string | null;
  mrr_cents: number | null;
  billing_interval: string | null;
  current_period_end: string | null;
  past_due_since: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  card_expires_at: string | null;
  failure_count: number | null;
  next_retry_at: string | null;
  last_payment_attempt_at: string | null;
  last_payment_error: string | null;
};

type PaymentEvent = {
  id: string;
  org_id: string;
  event_type: string;
  amount_cents: number | null;
  failure_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ============================================================================
// Helpers
// ============================================================================

function fmtCurrency(cents: number | null | undefined) {
  if (cents == null) return "—";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

// ============================================================================
// Page
// ============================================================================

function useActiveOrgId(): string | null {
  const [orgId, setOrgId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setOrgId(window.localStorage.getItem("hive.activeOrgId"));
    } catch {
      /* ignore */
    }
  }, []);
  return orgId;
}

function SubscriptionPage() {
  const orgId = useActiveOrgId();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const subQuery = useQuery({
    enabled: !!orgId,
    queryKey: ["sub-page-subscription", orgId],
    queryFn: async (): Promise<Subscription | null> => {
      const { data, error } = await supabase
        .from("org_subscriptions")
        .select(
          "id, organization_id, plan, status, mrr_cents, billing_interval, current_period_end, past_due_since, locked_at, lock_reason, card_expires_at, failure_count, next_retry_at, last_payment_attempt_at, last_payment_error",
        )
        .eq("organization_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Subscription | null) ?? null;
    },
  });

  const eventsQuery = useQuery({
    enabled: !!orgId,
    queryKey: ["sub-page-events", orgId],
    queryFn: async (): Promise<PaymentEvent[]> => {
      const { data, error } = await supabase
        .from("payment_events")
        .select("id, org_id, event_type, amount_cents, failure_reason, metadata, created_at")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data as PaymentEvent[] | null) ?? [];
    },
  });

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["sub-page-subscription", orgId] }),
      qc.invalidateQueries({ queryKey: ["sub-page-events", orgId] }),
      qc.invalidateQueries({ queryKey: ["org-subscription-banner", orgId] }),
    ]);
  };

  if (!orgId) {
    return <div className="text-sm text-muted-foreground">No active organization.</div>;
  }
  if (subQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const sub = subQuery.data ?? null;
  const events = eventsQuery.data ?? [];
  const latestCardEvent = events.find((e) => e.event_type === "card_updated");
  const cardMeta = (latestCardEvent?.metadata ?? {}) as {
    last4?: string;
    cardholder_name?: string;
    exp_month?: number;
    exp_year?: number;
    brand?: string;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing &amp; payment</h1>
        <p className="text-sm text-muted-foreground">
          Manage your HIVE subscription, payment method, and billing history.
        </p>
      </header>

      <StatusCard sub={sub} />

      {sub?.past_due_since && !sub.locked_at && (
        <PastDueCard sub={sub} orgId={orgId} onAfter={refreshAll} />
      )}

      <PaymentMethodCard
        cardMeta={cardMeta}
        cardExpiresAt={sub?.card_expires_at ?? null}
        onUpdate={() => setModalOpen(true)}
      />

      <ContactAlertsCard orgId={orgId} />

      <BillingHistoryCard events={events} loading={eventsQuery.isLoading} />

      {import.meta.env.DEV && <DevPanel orgId={orgId} onAfter={refreshAll} />}

      <UpdatePaymentMethodModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        organizationId={orgId}
        onSaved={async () => {
          await refreshAll();
          setModalOpen(false);
        }}
      />
    </div>
  );
}

// ============================================================================
// Status badge
// ============================================================================

function StatusCard({ sub }: { sub: Subscription | null }) {
  if (!sub) {
    return (
      <Card className="p-5">
        <div className="text-sm text-muted-foreground">No subscription on file.</div>
      </Card>
    );
  }

  let badge: { label: string; className: string; icon: React.ReactNode };
  if (sub.locked_at) {
    badge = {
      label: "Locked",
      className: "bg-red-600 text-white border-red-700",
      icon: <Lock className="h-3.5 w-3.5" />,
    };
  } else if (sub.past_due_since) {
    const days = daysSince(sub.past_due_since);
    badge = {
      label: `Past due · ${days} ${days === 1 ? "day" : "days"}`,
      className: "bg-amber-500 text-[#0F1A2E] border-amber-600",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
    };
  } else {
    badge = {
      label: "Active",
      className: "bg-emerald-600 text-white border-emerald-700",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    };
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Subscription status
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
            >
              {badge.icon} {badge.label}
            </span>
            {sub.plan && (
              <span className="text-sm text-muted-foreground">
                Plan: <span className="font-medium text-foreground">{sub.plan}</span>
              </span>
            )}
          </div>
        </div>
        <div className="text-right text-sm">
          {sub.mrr_cents != null && (
            <div>
              <span className="font-semibold">{fmtCurrency(sub.mrr_cents)}</span>{" "}
              <span className="text-muted-foreground">
                / {sub.billing_interval ?? "month"}
              </span>
            </div>
          )}
          {sub.current_period_end && (
            <div className="text-xs text-muted-foreground">
              Renews {fmtDate(sub.current_period_end)}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// Past due summary
// ============================================================================

function PastDueCard({
  sub,
  orgId,
  onAfter,
}: {
  sub: Subscription;
  orgId: string;
  onAfter: () => Promise<void>;
}) {
  const payNowFn = useServerFn(adminRecordPaymentSuccessFn);
  const [paying, setPaying] = useState(false);
  const days = daysSince(sub.past_due_since);
  const daysToLock = Math.max(0, 30 - days);
  const owed = sub.mrr_cents ?? 0;

  const onPay = async () => {
    setPaying(true);
    try {
      await payNowFn({ data: { organization_id: orgId, amount_cents: owed } });
      toast.success("Payment recorded — service restored");
      await onAfter();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  return (
    <Card className="border-amber-500/60 bg-amber-50/60 p-5 dark:bg-amber-950/20">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5" />
            <div className="font-semibold">Past due balance</div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
            <Stat label="Amount owed" value={fmtCurrency(owed)} />
            <Stat label="Days past due" value={String(days)} />
            <Stat label="Next retry" value={fmtDate(sub.next_retry_at)} />
            <Stat label="Days until lockout" value={String(daysToLock)} />
          </div>
          {sub.last_payment_error && (
            <div className="text-xs text-amber-900/80 dark:text-amber-200/80">
              Last error: {sub.last_payment_error}
            </div>
          )}
        </div>
        <Button onClick={onPay} disabled={paying} className="bg-amber-600 hover:bg-amber-700">
          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Pay now
        </Button>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

// ============================================================================
// Payment method
// ============================================================================

function PaymentMethodCard({
  cardMeta,
  cardExpiresAt,
  onUpdate,
}: {
  cardMeta: { last4?: string; cardholder_name?: string; exp_month?: number; exp_year?: number; brand?: string };
  cardExpiresAt: string | null;
  onUpdate: () => void;
}) {
  const days = daysUntil(cardExpiresAt);
  let expiryTone = "text-muted-foreground";
  let expiryNote: string | null = null;
  if (days != null) {
    if (days < 0) {
      expiryTone = "text-red-600 font-semibold";
      expiryNote = "Expired";
    } else if (days <= 60) {
      expiryTone = "text-amber-700 font-semibold";
      expiryNote = `Expires in ${days} ${days === 1 ? "day" : "days"}`;
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Payment method
          </div>
          <div className="mt-1 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-muted-foreground" />
            {cardMeta.last4 ? (
              <div>
                <div className="font-medium">
                  {(cardMeta.brand ?? "Card")} •••• {cardMeta.last4}
                </div>
                <div className={`text-xs ${expiryTone}`}>
                  {cardMeta.exp_month && cardMeta.exp_year
                    ? `Expires ${String(cardMeta.exp_month).padStart(2, "0")}/${String(cardMeta.exp_year).slice(-2)}`
                    : cardExpiresAt
                      ? `Expires ${fmtDate(cardExpiresAt)}`
                      : "Expiry unknown"}
                  {expiryNote ? ` — ${expiryNote}` : ""}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No card on file</div>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={onUpdate}>
          <CreditCard className="h-4 w-4" /> Update card
        </Button>
      </div>
    </Card>
  );
}

// ============================================================================
// Billing history
// ============================================================================

const EVENT_LABELS: Record<string, string> = {
  payment_succeeded: "Payment succeeded",
  payment_failed: "Payment failed",
  payment_retried: "Payment retried",
  card_updated: "Card updated",
  card_expiry_warning: "Card expiry warning",
  account_locked: "Account locked",
  account_unlocked: "Account unlocked",
  subscription_created: "Subscription created",
  subscription_cancelled: "Subscription cancelled",
  stripe_webhook_received: "Webhook received",
};

function resultFor(type: string): { label: string; className: string; icon: React.ReactNode } | null {
  if (type === "payment_succeeded") {
    return {
      label: "Succeeded",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
      icon: <CheckCircle2 className="h-3 w-3" />,
    };
  }
  if (type === "payment_failed") {
    return {
      label: "Failed",
      className: "bg-red-100 text-red-800 border-red-200",
      icon: <XCircle className="h-3 w-3" />,
    };
  }
  return null;
}

function BillingHistoryCard({ events, loading }: { events: PaymentEvent[]; loading: boolean }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Billing history
          </div>
          <div className="text-sm text-muted-foreground">Last 12 payment events</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                  No billing events yet.
                </TableCell>
              </TableRow>
            ) : (
              events.map((e) => {
                const result = resultFor(e.event_type);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(e.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {EVENT_LABELS[e.event_type] ?? e.event_type}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {e.amount_cents != null ? fmtCurrency(e.amount_cents) : "—"}
                    </TableCell>
                    <TableCell>
                      {result ? (
                        <Badge variant="outline" className={`gap-1 ${result.className}`}>
                          {result.icon} {result.label}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                      {e.failure_reason ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// ============================================================================
// Dev panel
// ============================================================================

function DevPanel({ orgId, onAfter }: { orgId: string; onAfter: () => Promise<void> }) {
  const failFn = useServerFn(adminRecordPaymentFailureFn);
  const successFn = useServerFn(adminRecordPaymentSuccessFn);
  const expiryFn = useServerFn(adminSimulateCardExpiryFn);
  const lockFn = useServerFn(adminLockAccountFn);
  const unlockFn = useServerFn(adminUnlockAccountFn);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      await onAfter();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setBusy(null);
    }
  };

  const Btn = ({
    k,
    label,
    onClick,
    danger,
  }: {
    k: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <Button
      type="button"
      variant={danger ? "destructive" : "outline"}
      size="sm"
      disabled={busy !== null}
      onClick={onClick}
    >
      {busy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );

  return (
    <Card className="border-dashed border-purple-400/60 bg-purple-50/40 p-5 dark:bg-purple-950/20">
      <div className="mb-3 flex items-center gap-2 text-purple-900 dark:text-purple-200">
        <Beaker className="h-4 w-4" />
        <div className="text-sm font-semibold">Developer panel</div>
        <Badge variant="outline" className="border-purple-300 text-purple-900 dark:text-purple-200">
          dev only
        </Badge>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Trigger billing state transitions end-to-end. Each button calls the corresponding server
        function so emails, banners, and lockout flow exactly as in production.
      </p>
      <div className="flex flex-wrap gap-2">
        <Btn
          k="fail"
          label="Simulate payment failure"
          onClick={() =>
            run(
              "fail",
              () => failFn({ data: { organization_id: orgId, reason: "card_declined (simulated)" } }),
              "Payment failure recorded",
            )
          }
        />
        <Btn
          k="success"
          label="Simulate payment success"
          onClick={() =>
            run(
              "success",
              () => successFn({ data: { organization_id: orgId, amount_cents: 9900 } }),
              "Payment success recorded",
            )
          }
        />
        <Btn
          k="expiry"
          label="Simulate card expiry warning"
          onClick={() =>
            run(
              "expiry",
              () => expiryFn({ data: { organization_id: orgId } }),
              "Card expiry warning sent",
            )
          }
        />
        <Btn
          k="lock"
          label="Simulate lockout"
          danger
          onClick={() =>
            run(
              "lock",
              () => lockFn({ data: { organization_id: orgId, reason: "Manual simulation" } }),
              "Account locked",
            )
          }
        />
        <Btn
          k="unlock"
          label="Simulate unlock"
          onClick={() =>
            run(
              "unlock",
              () => unlockFn({ data: { organization_id: orgId } }),
              "Account unlocked",
            )
          }
        />
      </div>
    </Card>
  );
}

// ============================================================================
// Update payment method modal (shared shape with the banner)
// ============================================================================

function UpdatePaymentMethodModal({
  open,
  onOpenChange,
  organizationId,
  onSaved,
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
    if (!open) setError(null);
  }, [open]);

  const parseExp = (raw: string): { month: number; year: number } | null => {
    const m = raw.replace(/\s/g, "").match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
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
    if (digits.length < 13 || digits.length > 19) return setError("Enter a valid card number.");
    const last4 = digits.slice(-4);
    const parsedExp = parseExp(exp);
    if (!parsedExp) return setError("Enter expiry as MM/YY.");
    if (!/^\d{3,4}$/.test(cvc)) return setError("CVC must be 3 or 4 digits.");
    if (!name.trim()) return setError("Cardholder name is required.");
    if (!zip.trim()) return setError("ZIP / postal code is required.");

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
      setName(""); setCard(""); setExp(""); setCvc(""); setZip("");
      await onSaved();
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
            <CreditCard className="h-5 w-5" /> Update payment method
          </DialogTitle>
          <DialogDescription>
            Your service is restored as soon as your card is updated. Card details are sent
            securely and never stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pm-name">Cardholder name</Label>
            <Input id="pm-name" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pm-card">Card number</Label>
            <Input id="pm-card" autoComplete="cc-number" inputMode="numeric" placeholder="1234 5678 9012 3456" value={card} onChange={(e) => setCard(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-exp">Expiry (MM/YY)</Label>
              <Input id="pm-exp" autoComplete="cc-exp" inputMode="numeric" placeholder="12/29" value={exp} onChange={(e) => setExp(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-cvc">CVC</Label>
              <Input id="pm-cvc" autoComplete="cc-csc" inputMode="numeric" placeholder="123" value={cvc} onChange={(e) => setCvc(e.target.value)} required />
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
              Cancel
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

// ============================================================================
// Contact and billing alerts (SMS phone)
// ============================================================================

function ContactAlertsCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getBillingSmsPhone);
  const updateFn = useServerFn(updateBillingSmsPhone);

  const phoneQ = useQuery({
    queryKey: ["billing-sms-phone", orgId],
    queryFn: () => getFn({ data: { organizationId: orgId } }),
  });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const current = phoneQ.data?.phone ?? null;
  const draftValid = isValidUSPhone(draft);

  const startEdit = () => {
    setDraft(current ?? "");
    setEditing(true);
  };

  const save = async () => {
    if (!draftValid) {
      toast.error("Enter a valid US mobile number.");
      return;
    }
    setBusy(true);
    try {
      await updateFn({ data: { organizationId: orgId, phone: draft } });
      toast.success("Mobile number updated");
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ["billing-sms-phone", orgId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update number");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Contact and billing alerts</h2>
          <p className="text-sm text-muted-foreground">
            Mobile number for urgent billing texts. Required — a number must always be on file.
          </p>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit}>
            {current ? "Update number" : "Add number"}
          </Button>
        ) : null}
      </div>

      <div className="mt-4">
        {!editing ? (
          <div className="text-sm">
            {phoneQ.isLoading ? (
              <span className="text-muted-foreground">Loading…</span>
            ) : current ? (
              <span className="font-medium">{formatUSPhonePretty(current)}</span>
            ) : (
              <span className="text-amber-600">No mobile number on file — add one now.</span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="billing-sms-phone">Mobile number</Label>
              <Input
                id="billing-sms-phone"
                type="tel"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="(801) 555-0123"
                autoComplete="tel"
              />
              <p className="text-xs text-muted-foreground">
                Used only for urgent billing alerts. Never marketing.
              </p>
              {draft && !draftValid ? (
                <p className="text-xs text-destructive">Enter a valid 10-digit US mobile number.</p>
              ) : draftValid ? (
                <p className="text-xs text-muted-foreground">
                  We'll text: {normalizeUSPhoneToE164(draft)}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button onClick={save} disabled={busy || !draftValid}>
                {busy ? "Saving…" : "Save number"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
