import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTrainingClassCheckoutFn } from "@/lib/stripe-checkout.functions";
import {
  quoteTrainingClass,
  trainingClassLabel,
  validateRosterRows,
  type TrainingClassRosterRow,
  type TrainingClassType,
} from "@/lib/training-class";
import { formatUsdFromCents } from "@/lib/hive-pricing";

export type RosterMemberOption = { id: string; label: string; email?: string | null; phone?: string | null };

const emptyRow = (): TrainingClassRosterRow => ({ name: "", email: "", phone: "", staffUserId: null });

export function ClassRosterDialog({
  organizationId,
  trainingType,
  billingExempt,
  members,
  triggerLabel,
  testId,
  onSubmitted,
}: {
  organizationId: string | null | undefined;
  trainingType: TrainingClassType;
  billingExempt: boolean;
  members: RosterMemberOption[];
  triggerLabel: string;
  testId: string;
  onSubmitted?: () => void;
}) {
  const checkoutFn = useServerFn(createTrainingClassCheckoutFn);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TrainingClassRosterRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);

  const quote = useMemo(
    () => quoteTrainingClass(trainingType, Math.max(1, rows.filter((r) => r.name || r.email).length || 1), billingExempt),
    [trainingType, rows, billingExempt],
  );
  const filledCount = rows.filter((r) => r.name.trim() && r.email.trim() && r.phone.trim()).length;
  const liveQuote = quoteTrainingClass(trainingType, Math.max(1, filledCount), billingExempt);

  const updateRow = (idx: number, patch: Partial<TrainingClassRosterRow>) => {
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const pickMember = (idx: number, memberId: string) => {
    const m = members.find((x) => x.id === memberId);
    if (!m) return;
    updateRow(idx, {
      staffUserId: m.id,
      name: m.label,
      email: m.email ?? "",
      phone: m.phone ?? "",
    });
  };

  const submit = async () => {
    if (!organizationId) return;
    const err = validateRosterRows(rows);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const r = await checkoutFn({
        data: {
          organizationId,
          trainingType,
          roster: rows,
        },
      });
      if (r.granted) {
        toast.success(
          billingExempt
            ? "True North is never charged. Obligations are open for this roster."
            : "Roster submitted with no charge.",
        );
        onSubmitted?.();
        setOpen(false);
        setRows([emptyRow()]);
        setBusy(false);
        return;
      }
      if (r.error || !r.url) throw new Error(r.error ?? "Checkout URL missing");
      window.location.href = r.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit the roster.";
      if (msg.includes("payments_not_configured") || msg.includes("STRIPE_SECRET_KEY")) {
        toast.error("Payments are not set up yet. Ask a Hive Executive to add the Stripe test keys.");
      } else {
        toast.error(msg);
      }
      setBusy(false);
    }
  };

  const title = trainingClassLabel(trainingType);
  const isExternal = trainingType !== "thirty_day";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-[#1A2B47] text-white hover:bg-[#1A2B47]/90" data-testid={testId}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit {title} roster</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {isExternal
            ? "One submit is one class. After payment, Hive Executive gets one alert. Staff only see an obligation. Upload the card when the class is done."
            : "Buying a 30-day seat assigns the in-Hive 30-day course from My Obligations. This is not an external class."}
        </p>
        {billingExempt && (
          <p className="rounded-md border border-[#C8881E]/30 bg-[#FFF9EE] px-3 py-2 text-xs text-[#1A2B47]">
            True North Supports is never charged. This roster still opens the obligations.
          </p>
        )}
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={idx} className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">Staff {idx + 1}</span>
                {rows.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                )}
              </div>
              {members.length > 0 && (
                <div>
                  <Label className="text-xs">Fill from team</Label>
                  <Select onValueChange={(v) => pickMember(idx, v)}>
                    <SelectTrigger><SelectValue placeholder="Optional — pick a staff member" /></SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label htmlFor={`roster-name-${idx}`}>Name</Label>
                <Input
                  id={`roster-name-${idx}`}
                  value={row.name}
                  onChange={(e) => updateRow(idx, { name: e.target.value })}
                  autoComplete="name"
                  data-testid={`training-roster-name-${idx}`}
                />
              </div>
              <div>
                <Label htmlFor={`roster-email-${idx}`}>Email</Label>
                <Input
                  id={`roster-email-${idx}`}
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(idx, { email: e.target.value })}
                  autoComplete="email"
                  data-testid={`training-roster-email-${idx}`}
                />
              </div>
              <div>
                <Label htmlFor={`roster-phone-${idx}`}>Phone</Label>
                <Input
                  id={`roster-phone-${idx}`}
                  type="tel"
                  value={row.phone}
                  onChange={(e) => updateRow(idx, { phone: e.target.value })}
                  autoComplete="tel"
                  data-testid={`training-roster-phone-${idx}`}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" className="w-full" onClick={() => setRows((prev) => [...prev, emptyRow()])}>
            <Plus className="mr-1 h-4 w-4" /> Add another staff
          </Button>
        </div>
        <div className="flex items-baseline justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            {filledCount || 1} seat{(filledCount || 1) === 1 ? "" : "s"} · {formatUsdFromCents(liveQuote.unitCents)} each
          </span>
          <span className="text-base font-semibold text-[#1A2B47]">
            {billingExempt ? "$0" : formatUsdFromCents(liveQuote.totalCents)}
          </span>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={busy || !organizationId}
            data-testid="training-roster-submit"
            className="bg-[#C8881E] text-white hover:bg-[#C8881E]/90"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : billingExempt ? "Submit roster" : "Continue to payment"}
          </Button>
        </DialogFooter>
        <p className="sr-only">{quote.totalCents}</p>
      </DialogContent>
    </Dialog>
  );
}
