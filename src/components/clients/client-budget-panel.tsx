// Client Budget / Financial Planning — inside the Funds tab of the client
// profile. Distinct card from Billing Codes and (future) PBA supports.
//
// Model mirrors the Riley monthly-budget statement:
//   - one budget per client per month (client_budgets)
//   - line items grouped income / expense / other (client_budget_lines)
//   - each line has non-variable + variable columns; total = nv + v
//   - free-text `details` narrative on the parent budget
//
// v1 scope (per user): editor + totals/difference + details + seed suggestions
// from client.income_sources. Spending-tracking log, PDF/print/email, and
// NECTAR flags land in a follow-up.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Save, Sparkles, FileText, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { renderClientBudgetPdf, budgetPdfFilename, type BudgetPdfPayload } from "@/lib/client-budget-pdf";

type Section = "income" | "expense" | "other";

interface BudgetLine {
  id: string;
  budget_id: string;
  section: Section;
  sort_order: number;
  label: string;
  non_variable: number;
  variable: number;
  notes: string | null;
  day_of_month: number | null;
}

interface Budget {
  id: string;
  organization_id: string;
  client_id: string;
  period_month: string; // YYYY-MM-01
  details: string | null;
  created_by: string | null;
  updated_at: string;
}

function firstOfMonth(iso: string): string {
  // Accept "YYYY-MM" or "YYYY-MM-DD"; return YYYY-MM-01
  const m = iso.slice(0, 7);
  return `${m}-01`;
}
function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmt$(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function ClientBudgetPanel({ clientId }: { clientId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const canEdit = org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";
  const qc = useQueryClient();

  const [monthInput, setMonthInput] = useState<string>(currentMonthValue());
  const periodMonth = firstOfMonth(monthInput);

  // Fetch the client (for seeding suggestions).
  const clientQ = useQuery({
    enabled: !!clientId,
    queryKey: ["client-budget-seed", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, income_sources, payment_sources")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch (or lack of) budget for this month.
  const budgetQ = useQuery({
    enabled: !!clientId && !!orgId,
    queryKey: ["client-budget", clientId, periodMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_budgets")
        .select("*")
        .eq("client_id", clientId)
        .eq("period_month", periodMonth)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Budget | null;
    },
  });

  const linesQ = useQuery({
    enabled: !!budgetQ.data?.id,
    queryKey: ["client-budget-lines", budgetQ.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_budget_lines")
        .select("*")
        .eq("budget_id", budgetQ.data!.id)
        .order("section")
        .order("day_of_month", { ascending: true, nullsFirst: false })
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as BudgetLine[];
    },
  });

  const createBudget = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { data: newBudget, error } = await supabase
        .from("client_budgets")
        .insert({
          organization_id: orgId,
          client_id: clientId,
          period_month: periodMonth,
          created_by: uid,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Seed income lines from client.income_sources (labels only — no fabricated amounts).
      const seedIncome = Array.isArray(clientQ.data?.income_sources)
        ? (clientQ.data!.income_sources as string[])
        : [];
      const seedRows = seedIncome
        .filter((s) => s && s.trim())
        .map((label, i) => ({
          budget_id: newBudget.id,
          section: "income" as const,
          sort_order: i,
          label: label.trim(),
          non_variable: 0,
          variable: 0,
          notes: null,
          day_of_month: null,
        }));
      if (seedRows.length) {
        const { error: eIns } = await supabase.from("client_budget_lines").insert(seedRows);
        if (eIns) throw eIns;
      }
      return newBudget as Budget;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-budget", clientId, periodMonth] });
      toast.success("Budget started for this month");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const budget = budgetQ.data;
  const lines = linesQ.data ?? [];

  if (clientQ.isLoading || budgetQ.isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Client Budget</CardTitle></CardHeader>
        <CardContent><div className="text-sm text-muted-foreground">Loading…</div></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            Client Budget
            <Badge variant="outline" className="text-xs font-normal">Day-to-day planning</Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Monthly income &amp; spending plan. Separate from the PBA trust ledger.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="budget-month" className="text-xs">Month</Label>
            <Input
              id="budget-month"
              type="month"
              value={monthInput}
              onChange={(e) => setMonthInput(e.target.value)}
              className="w-[140px]"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!budget ? (
          <div className="rounded-md border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No budget exists for {new Date(`${periodMonth}T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.
            </p>
            {canEdit ? (
              <Button
                className="mt-3"
                onClick={() => createBudget.mutate()}
                disabled={createBudget.isPending}
              >
                <Plus className="mr-2 h-4 w-4" />
                Start a budget for this month
              </Button>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Ask an admin or manager to start one.</p>
            )}
            {canEdit && Array.isArray(clientQ.data?.income_sources) && (clientQ.data!.income_sources as string[]).length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                <Sparkles className="mr-1 inline h-3 w-3" />
                Income lines will be seeded from the client's saved income sources: {(clientQ.data!.income_sources as string[]).join(", ")}
              </p>
            )}
          </div>
        ) : (
          <BudgetEditor
            budget={budget}
            lines={lines}
            canEdit={canEdit}
            clientName={
              [clientQ.data?.first_name, clientQ.data?.last_name].filter(Boolean).join(" ") || "Client"
            }
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function BudgetEditor({ budget, lines, canEdit, clientName }: { budget: Budget; lines: BudgetLine[]; canEdit: boolean; clientName: string }) {
  const qc = useQueryClient();

  // Local draft state so keystrokes don't fire a request per character.
  const [draft, setDraft] = useState<BudgetLine[]>(lines);
  const [details, setDetails] = useState<string>(budget.details ?? "");
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [detailsDirty, setDetailsDirty] = useState(false);

  useEffect(() => { setDraft(lines); setDirtyIds(new Set()); }, [lines]);
  useEffect(() => { setDetails(budget.details ?? ""); setDetailsDirty(false); }, [budget.id, budget.details]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-budget-lines", budget.id] });
    qc.invalidateQueries({ queryKey: ["client-budget", budget.client_id, budget.period_month] });
  };

  const addLine = useMutation({
    mutationFn: async (section: Section) => {
      const nextOrder = Math.max(-1, ...draft.filter((l) => l.section === section).map((l) => l.sort_order)) + 1;
      const { error } = await supabase.from("client_budget_lines").insert({
        budget_id: budget.id, section, sort_order: nextOrder,
        label: "", non_variable: 0, variable: 0, notes: null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_budget_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: async () => {
      const updates = draft.filter((l) => dirtyIds.has(l.id));
      for (const l of updates) {
        const { error } = await supabase
          .from("client_budget_lines")
          .update({
            label: l.label, non_variable: l.non_variable, variable: l.variable, notes: l.notes,
          })
          .eq("id", l.id);
        if (error) throw error;
      }
      if (detailsDirty) {
        const { error } = await supabase
          .from("client_budgets")
          .update({ details })
          .eq("id", budget.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Budget saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = (id: string, changes: Partial<BudgetLine>) => {
    setDraft((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)));
    setDirtyIds((prev) => new Set(prev).add(id));
  };

  // Totals
  const totals = useMemo(() => {
    const sum = (arr: BudgetLine[]) => arr.reduce((acc, l) => acc + Number(l.non_variable) + Number(l.variable), 0);
    const income = sum(draft.filter((l) => l.section === "income"));
    const expense = sum(draft.filter((l) => l.section === "expense"));
    const other = sum(draft.filter((l) => l.section === "other"));
    return { income, expense, other, difference: income - expense - other };
  }, [draft]);

  const dirty = dirtyIds.size > 0 || detailsDirty;

  const periodLabel = new Date(`${budget.period_month}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const buildPayload = (): BudgetPdfPayload => {
    const toLines = (section: Section) =>
      draft
        .filter((l) => l.section === section)
        .map((l) => ({
          label: l.label ?? "",
          non_variable: Number(l.non_variable) || 0,
          variable: Number(l.variable) || 0,
          notes: l.notes,
        }));
    return {
      clientName,
      periodLabel,
      details,
      income: toLines("income"),
      expense: toLines("expense"),
      other: toLines("other"),
    };
  };

  const [pdfBusy, setPdfBusy] = useState<null | "download" | "print">(null);

  const openPdf = async (mode: "download" | "print") => {
    setPdfBusy(mode);
    try {
      const bytes = await renderClientBudgetPdf(buildPayload());
      // Uint8Array → Blob (avoid ArrayBufferLike TS complaint)
      const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const filename = budgetPdfFilename(clientName, periodLabel);
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else if (mode === "print") {
        // Trigger print once loaded (browser PDF viewer honors afterprint via user).
        win.addEventListener("load", () => {
          try { win.focus(); win.print(); } catch { /* noop */ }
        });
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate PDF");
    } finally {
      setPdfBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => openPdf("download")}
          disabled={pdfBusy !== null}
        >
          <FileText className="mr-2 h-4 w-4" />
          {pdfBusy === "download" ? "Building…" : "Download PDF"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openPdf("print")}
          disabled={pdfBusy !== null}
        >
          <Printer className="mr-2 h-4 w-4" />
          {pdfBusy === "print" ? "Building…" : "Print"}
        </Button>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => saveAll.mutate()}
            disabled={!dirty || saveAll.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveAll.isPending ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
        )}
      </div>


      <SectionBlock
        title="Income"
        section="income"
        lines={draft.filter((l) => l.section === "income")}
        canEdit={canEdit}
        onAdd={() => addLine.mutate("income")}
        onDelete={(id) => deleteLine.mutate(id)}
        onPatch={patch}
      />

      <SectionBlock
        title="Expenses / Needs"
        section="expense"
        lines={draft.filter((l) => l.section === "expense")}
        canEdit={canEdit}
        onAdd={() => addLine.mutate("expense")}
        onDelete={(id) => deleteLine.mutate(id)}
        onPatch={patch}
      />

      <SectionBlock
        title="Other Needs / Wants / Activities / Savings"
        section="other"
        lines={draft.filter((l) => l.section === "other")}
        canEdit={canEdit}
        onAdd={() => addLine.mutate("other")}
        onDelete={(id) => deleteLine.mutate(id)}
        onPatch={patch}
      />

      {/* Totals block */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <TotalTile label="Total income" value={totals.income} tone="positive" />
          <TotalTile label="Total expenses" value={totals.expense} tone="negative" />
          <TotalTile label="Total other" value={totals.other} tone="negative" />
          <TotalTile
            label="Difference"
            value={totals.difference}
            tone={totals.difference >= 0 ? "positive" : "danger"}
            emphasize
          />
        </div>
      </div>

      {/* Details narrative */}
      <div>
        <Label htmlFor="budget-details" className="text-sm font-medium">Details / narrative</Label>
        <p className="mb-1 text-xs text-muted-foreground">
          Banking notes, payee-payback schedule, card usage, spending guidance — free text.
        </p>
        <Textarea
          id="budget-details"
          value={details}
          onChange={(e) => { setDetails(e.target.value); setDetailsDirty(true); }}
          disabled={!canEdit}
          rows={5}
          placeholder="E.g., banks at Zion's, uses Smith's credit card for groceries, Horizon card for food stamps…"
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionBlock({
  title, section, lines, canEdit, onAdd, onDelete, onPatch,
}: {
  title: string;
  section: Section;
  lines: BudgetLine[];
  canEdit: boolean;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onPatch: (id: string, changes: Partial<BudgetLine>) => void;
}) {
  const subtotal = lines.reduce((a, l) => a + Number(l.non_variable) + Number(l.variable), 0);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="flex items-center gap-3">
          <div className="text-sm">
            Subtotal: <span className="font-medium">{fmt$(subtotal)}</span>
          </div>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus className="mr-1 h-3 w-3" /> Add line
            </Button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="w-[28%] py-1 pr-2">Label</th>
              <th className="w-[14%] py-1 pr-2 text-right">Non-variable</th>
              <th className="w-[14%] py-1 pr-2 text-right">Variable</th>
              <th className="w-[12%] py-1 pr-2 text-right">Total</th>
              <th className="w-[28%] py-1 pr-2">Notes</th>
              {canEdit && <th className="w-[4%] py-1" />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="py-3 text-center text-xs text-muted-foreground">
                  No {section} lines yet.
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const total = Number(l.non_variable) + Number(l.variable);
              return (
                <tr key={l.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-2">
                    <Input
                      value={l.label}
                      onChange={(e) => onPatch(l.id, { label: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Label"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={l.non_variable}
                      onChange={(e) => onPatch(l.id, { non_variable: Number(e.target.value) || 0 })}
                      disabled={!canEdit}
                      className="text-right"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <Input
                      type="number" step="0.01" min="0" inputMode="decimal"
                      value={l.variable}
                      onChange={(e) => onPatch(l.id, { variable: Number(e.target.value) || 0 })}
                      disabled={!canEdit}
                      className="text-right"
                    />
                  </td>
                  <td className="py-2 pr-2 text-right font-medium tabular-nums">{fmt$(total)}</td>
                  <td className="py-2 pr-2">
                    <Input
                      value={l.notes ?? ""}
                      onChange={(e) => onPatch(l.id, { notes: e.target.value })}
                      disabled={!canEdit}
                      placeholder="Notes"
                    />
                  </td>
                  {canEdit && (
                    <td className="py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(l.id)}
                        aria-label="Delete line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotalTile({
  label, value, tone, emphasize,
}: { label: string; value: number; tone: "positive" | "negative" | "danger"; emphasize?: boolean }) {
  const toneClass =
    tone === "positive" ? "text-emerald-700"
    : tone === "danger" ? "text-rose-700"
    : "text-foreground";
  return (
    <div className={`rounded-md border bg-background p-3 ${emphasize ? "ring-2 ring-primary/30" : ""}`}>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${emphasize ? "text-2xl font-bold" : "text-lg font-semibold"} ${toneClass}`}>
        {fmt$(value)}
      </div>
    </div>
  );
}
