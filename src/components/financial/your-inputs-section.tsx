import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listLedgerEntries,
  createLedgerEntry,
  updateLedgerEntry,
  deleteLedgerEntry,
  LEDGER_CATEGORIES,
  CATEGORY_SIGN,
  type LedgerCategory,
} from "@/lib/provider-ledger.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fmtUSD } from "@/lib/billing-units";
import { Pencil, Plus, Trash2, UserPen } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<LedgerCategory, string> = {
  expense: "Expense",
  payroll_tax: "Payroll tax",
  estimated_payroll: "Estimated payroll",
  received: "Received (payment)",
  custom: "Custom line",
};

type Entry = {
  id: string;
  category: LedgerCategory;
  label: string;
  amount: number | string;
  is_estimate: boolean;
  note: string | null;
};

export function YourInputsSection({
  year,
  month,
  organizationId,
  onTotalsChange,
}: {
  year: number;
  /** 1–12 (UTC month index + 1). For YTD/quarterly views, this section is hidden by the parent. */
  month: number;
  organizationId: string;
  onTotalsChange?: (totals: { inputsSubtotal: number; entriesCount: number }) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listLedgerEntries);
  const createFn = useServerFn(createLedgerEntry);
  const updateFn = useServerFn(updateLedgerEntry);
  const deleteFn = useServerFn(deleteLedgerEntry);

  const queryKey = ["provider-ledger", year, month, organizationId] as const;
  const q = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { year, month, organizationId } }),
  });

  const entries: Entry[] = useMemo(
    () => (q.data?.entries ?? []) as unknown as Entry[],
    [q.data],
  );

  const grouped = useMemo(() => {
    const g = new Map<LedgerCategory, Entry[]>();
    for (const e of entries) {
      const arr = g.get(e.category) ?? [];
      arr.push(e);
      g.set(e.category, arr);
    }
    return g;
  }, [entries]);

  const inputsSubtotal = useMemo(() => {
    let total = 0;
    for (const e of entries) {
      total += CATEGORY_SIGN[e.category] * Number(e.amount ?? 0);
    }
    return Math.round(total * 100) / 100;
  }, [entries]);

  useEffect(() => {
    onTotalsChange?.({ inputsSubtotal, entriesCount: entries.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsSubtotal, entries.length]);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const createM = useMutation({
    mutationFn: createFn,
    onSuccess: () => {
      toast.success("Entry added");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateM = useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
      toast.success("Entry updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: deleteFn,
    onSuccess: () => {
      toast.success("Entry deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserPen className="h-4 w-4 text-primary" />
            Your Inputs
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">
              Entered by you
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manually entered figures for{" "}
            <span className="font-medium">
              {new Date(year, month - 1, 1).toLocaleString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </span>
            . May include estimates.
          </p>
        </div>
        <EntryDialog
          mode="create"
          year={year}
          month={month}
          onSubmit={(payload) =>
            createM.mutateAsync({ data: { ...payload, year, month, organizationId } })
          }
        />
      </header>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading entries…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/50 p-6 text-center">
          <p className="text-sm font-medium">No entries for this month yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add expenses, payroll, taxes, payments received, or your own custom lines.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {LEDGER_CATEGORIES.map((cat) => {
            const rows = grouped.get(cat);
            if (!rows?.length) return null;
            const sign = CATEGORY_SIGN[cat];
            const subtotal = rows.reduce(
              (s, r) => s + Number(r.amount ?? 0),
              0,
            );
            return (
              <div key={cat} className="rounded-lg border border-border/60 bg-background">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[cat]}
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal">
                      {sign > 0 ? "+ adds" : "− subtracts"}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmtUSD(subtotal)}
                  </span>
                </div>
                <ul className="divide-y divide-border/40">
                  {rows.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{e.label}</span>
                          {e.is_estimate && (
                            <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                              Estimate
                            </span>
                          )}
                        </div>
                        {e.note && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {e.note}
                          </p>
                        )}
                      </div>
                      <span className="tabular-nums">
                        {sign > 0 ? "+" : "−"} {fmtUSD(Math.abs(Number(e.amount ?? 0)))}
                      </span>
                      <div className="flex items-center gap-1">
                        <EntryDialog
                          mode="edit"
                          year={year}
                          month={month}
                          entry={e}
                          onSubmit={(payload) =>
                            updateM.mutateAsync({ data: { id: e.id, organizationId, ...payload } })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${e.label}"?`)) {
                              deleteM.mutate({ data: { id: e.id, organizationId } });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

type EntryPayload = {
  category: LedgerCategory;
  label: string;
  amount: number;
  is_estimate: boolean;
  note: string | null;
};

function EntryDialog({
  mode,
  entry,
  onSubmit,
}: {
  mode: "create" | "edit";
  year: number;
  month: number;
  entry?: Entry;
  onSubmit: (payload: EntryPayload) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<LedgerCategory>(
    entry?.category ?? "expense",
  );
  const [label, setLabel] = useState(entry?.label ?? "");
  const [amount, setAmount] = useState<string>(
    entry?.amount != null ? String(entry.amount) : "",
  );
  const [isEstimate, setIsEstimate] = useState(entry?.is_estimate ?? false);
  const [note, setNote] = useState(entry?.note ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const amt = Number(amount);
    if (!label.trim() || !isFinite(amt)) {
      toast.error("Label and a numeric amount are required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        category,
        label: label.trim(),
        amount: amt,
        is_estimate: isEstimate,
        note: note.trim() ? note.trim() : null,
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add entry
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add entry" : "Edit entry"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as LedgerCategory)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEDGER_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]} ({CATEGORY_SIGN[c] > 0 ? "+" : "−"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Rent, FICA, Payroll run"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="estimate-toggle">Mark as estimate</Label>
              <p className="text-xs text-muted-foreground">
                Flags this line as a best-guess figure.
              </p>
            </div>
            <Switch
              id="estimate-toggle"
              checked={isEstimate}
              onCheckedChange={setIsEstimate}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
