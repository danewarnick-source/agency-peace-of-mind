import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createTrainingClassCheckoutFn } from "@/lib/stripe-checkout.functions";
import {
  mergeSelectedMembersIntoRoster,
  quoteTrainingClass,
  trainingClassLabel,
  trainingClassUnitCents,
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
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [memberQuery, setMemberQuery] = useState("");

  const listUnitCents = trainingClassUnitCents(trainingType);
  const filledCount = rows.filter((r) => r.name.trim() && r.email.trim() && r.phone.trim()).length;
  const liveQuote = quoteTrainingClass(trainingType, Math.max(1, filledCount), billingExempt);
  const listTotalCents = listUnitCents * Math.max(1, filledCount);

  const alreadyOnRoster = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.staffUserId) ids.add(row.staffUserId);
    }
    return ids;
  }, [rows]);

  const filteredMembers = useMemo(() => {
    const needle = memberQuery.trim().toLowerCase();
    return members.filter((m) => {
      if (!needle) return true;
      return (
        m.label.toLowerCase().includes(needle) ||
        (m.email ?? "").toLowerCase().includes(needle)
      );
    });
  }, [members, memberQuery]);

  const selectableFiltered = filteredMembers.filter((m) => !alreadyOnRoster.has(m.id));
  const allFilteredSelected =
    selectableFiltered.length > 0 && selectableFiltered.every((m) => pickedIds.has(m.id));

  const updateRow = (idx: number, patch: Partial<TrainingClassRosterRow>) => {
    setRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const togglePicked = (id: string, checked: boolean) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        selectableFiltered.forEach((m) => next.delete(m.id));
      } else {
        selectableFiltered.forEach((m) => next.add(m.id));
      }
      return next;
    });
  };

  const addSelected = () => {
    if (pickedIds.size === 0) return;
    setRows((prev) => mergeSelectedMembersIntoRoster(prev, members, [...pickedIds]));
    setPickedIds(new Set());
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
        setPickedIds(new Set());
        setBusy(false);
        return;
      }
      if (r.error || !r.url) throw new Error(r.error ?? "Checkout URL missing");
      window.location.href = r.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not submit the roster.";
      if (msg.includes("payments_not_configured") || msg.includes("STRIPE_SECRET_KEY")) {
        toast.error("Payments are not set up yet. Ask an Exec to add the Stripe test keys.");
      } else {
        toast.error(msg);
      }
      setBusy(false);
    }
  };

  const title = trainingClassLabel(trainingType);
  const isExternal = trainingType !== "thirty_day";
  const seatLabel = (filledCount || 1) === 1 ? "seat" : "seats";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setPickedIds(new Set());
          setMemberQuery("");
        }
      }}
    >
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
            ? "One submit is one class. After payment, Exec gets one alert. Staff only see an obligation. Upload the card when the class is done."
            : "Buying a 30-day seat assigns the in-platform 30-day course from My Obligations. This is not an external class."}
        </p>
        {billingExempt && (
          <p className="rounded-md border border-[#C8881E]/30 bg-[#FFF9EE] px-3 py-2 text-xs text-[#1A2B47]">
            True North Supports is never charged. List price stays {formatUsdFromCents(listUnitCents)} / seat.
            This roster still opens the obligations.
          </p>
        )}

        {members.length > 0 && (
          <div className="space-y-2 rounded-md border p-3" data-testid="training-roster-multiselect">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-xs">Add from team</Label>
              <span className="text-xs text-muted-foreground">{pickedIds.size} selected</span>
            </div>
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Search staff…"
              className="h-9"
              data-testid="training-roster-staff-search"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllFiltered}
                disabled={selectableFiltered.length === 0}
                data-testid="training-roster-select-all"
              >
                {allFilteredSelected ? "Clear" : "Select all"}
              </Button>
              {pickedIds.size > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setPickedIds(new Set())}>
                  Clear
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="bg-[#1A2B47] text-white hover:bg-[#1A2B47]/90"
                onClick={addSelected}
                disabled={pickedIds.size === 0}
                data-testid="training-roster-add-selected"
              >
                Add selected ({pickedIds.size})
              </Button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border bg-background p-1.5">
              {filteredMembers.length === 0 ? (
                <p className="px-1.5 py-2 text-xs text-muted-foreground">No staff match that search.</p>
              ) : (
                filteredMembers.map((m) => {
                  const already = alreadyOnRoster.has(m.id);
                  const checked = already || pickedIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className={`flex min-h-[40px] items-center gap-2 rounded px-1.5 py-1 text-sm ${
                        already ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={already}
                        onCheckedChange={(v) => togglePicked(m.id, v === true)}
                        data-testid={`training-roster-staff-${m.id}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[#1A2B47]">{m.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {m.email || "No email on file"}
                          {m.phone ? ` · ${m.phone}` : ""}
                          {already ? " · already on roster" : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
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
          <span className="text-muted-foreground" data-testid="training-roster-list-price">
            {filledCount || 1} {seatLabel} × {formatUsdFromCents(listUnitCents)}
          </span>
          <span className="text-base font-semibold text-[#1A2B47]" data-testid="training-roster-total">
            {billingExempt ? "True North $0" : formatUsdFromCents(liveQuote.totalCents)}
          </span>
        </div>
        {billingExempt && (
          <p className="text-xs text-muted-foreground">
            List total {formatUsdFromCents(listTotalCents)} — True North is never charged.
          </p>
        )}
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
      </DialogContent>
    </Dialog>
  );
}
