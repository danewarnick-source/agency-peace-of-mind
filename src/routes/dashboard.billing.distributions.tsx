import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Copy, Sparkles, Info, ShieldCheck, AlertTriangle, Save } from "lucide-react";
import { computeEntryUnits, fmtUSD } from "@/lib/billing-units";
import { toast } from "sonner";
import { RequireRole } from "@/components/rbac-guard";

export const Route = createFileRoute("/dashboard/billing/distributions")({
  head: () => ({ meta: [{ title: "Distributions — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <DistributionsPage />
    </RequireRole>
  ),
});

const HHS_CODES = new Set(["HHS"]);

type PlanType = "profit_share" | "investor" | "ownership";
type Plan = {
  id: string;
  organization_id: string;
  name: string;
  plan_type: PlanType;
  retention_pct: number;
  expense_selection: Record<string, boolean>;
  formula_json: any | null;
  nectar_summary: string | null;
  status: "draft" | "approved";
  is_active: boolean;
  approved_by: string | null;
  approved_at: string | null;
};
type Participant = {
  id: string;
  plan_id: string;
  participant_name: string;
  participant_user_id: string | null;
  allocation_pct: number;
  role_label: string | null;
  notes: string | null;
  sort_order: number;
};

const EXPENSE_LINES: Array<{ key: string; label: string }> = [
  { key: "net_payroll", label: "Contractor net payroll" },
  { key: "additional_pay", label: "Additional pay (HHP, bonuses)" },
  { key: "federal_tax", label: "Federal payroll tax" },
  { key: "state_tax", label: "State payroll tax" },
  { key: "fica", label: "FICA / other" },
];

function DistributionsPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [scope, setScope] = useState<"month" | "quarter" | "year">("year");
  const [scopeIdx, setScopeIdx] = useState(today.getMonth()); // month: 0-11; quarter: 0-3
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // ---------- Plans ----------
  const plansQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-plans", org?.organization_id],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabase
        .from("distribution_plans" as never)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  useEffect(() => {
    if (!selectedPlanId && plansQ.data?.length) {
      setSelectedPlanId(plansQ.data.find((p) => p.is_active)?.id ?? plansQ.data[0].id);
    }
  }, [plansQ.data, selectedPlanId]);

  const partsQ = useQuery({
    enabled: !!selectedPlanId,
    queryKey: ["dist-parts", selectedPlanId],
    queryFn: async (): Promise<Participant[]> => {
      const { data, error } = await supabase
        .from("distribution_plan_participants" as never)
        .select("*")
        .eq("plan_id", selectedPlanId!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Participant[];
    },
  });

  const selectedPlan = plansQ.data?.find((p) => p.id === selectedPlanId) ?? null;

  // ---------- Financial data (mirror of Totals tab) ----------
  const yearStartIso = new Date(year, 0, 1).toISOString();
  const yearEndIso = new Date(year + 1, 0, 1).toISOString();
  const yearStartDate = `${year}-01-01`;
  const yearEndDate = `${year + 1}-01-01`;

  const cbcQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-cbc", org?.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("client_id, service_code, rate_per_unit")
        .eq("organization_id", org!.organization_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const evvQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-evv", org?.organization_id, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("client_id, service_type_code, clock_in_timestamp, clock_out_timestamp")
        .eq("organization_id", org!.organization_id)
        .gte("clock_in_timestamp", yearStartIso)
        .lt("clock_in_timestamp", yearEndIso);
      if (error) throw error;
      return data ?? [];
    },
  });

  const hhsQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-hhs", org?.organization_id, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hhs_daily_records_v")
        .select("client_id, record_date, billable, service_code")
        .eq("organization_id", org!.organization_id)
        .eq("service_code", "HHS")
        .gte("record_date", yearStartDate)
        .lt("record_date", yearEndDate);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.billable);
    },
  });

  const ctrQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-ctr", org?.organization_id, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contractor_monthly_pay" as never)
        .select("staff_id, year, month, net_pay, additional_pay, tax_federal, tax_state, tax_fica")
        .eq("organization_id", org!.organization_id)
        .eq("year", year);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const ledgerQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["dist-ledger", org?.organization_id, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_ledger_entries")
        .select("period_year, period_month, category, label, amount")
        .eq("organization_id", org!.organization_id)
        .eq("period_year", year);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Rate map
  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of (cbcQ.data ?? []) as any[]) m[`${r.client_id}|${r.service_code}`] = Number(r.rate_per_unit) || 0;
    return m;
  }, [cbcQ.data]);

  // Per-month roll-up of gross + expense lines
  const monthly = useMemo(() => {
    const out: Array<{
      mi: number; gross: number;
      net_payroll: number; additional_pay: number;
      federal_tax: number; state_tax: number; fica: number;
    }> = [];
    for (let mi = 0; mi < 12; mi++) {
      const tsMonth = ((evvQ.data ?? []) as any[]).filter((t) => new Date(t.clock_in_timestamp).getMonth() === mi);
      const hhsMonth = ((hhsQ.data ?? []) as any[]).filter((d) => new Date(d.record_date + "T00:00:00").getMonth() === mi);

      let billedDSP = 0;
      for (const t of tsMonth) {
        if (HHS_CODES.has(t.service_type_code)) continue;
        const units = computeEntryUnits(t.clock_in_timestamp, t.clock_out_timestamp);
        billedDSP += units * (rateMap[`${t.client_id}|${t.service_type_code}`] ?? 0);
      }
      const dayCount: Record<string, number> = {};
      for (const d of hhsMonth) dayCount[d.client_id] = (dayCount[d.client_id] ?? 0) + 1;
      let billedHHS = 0;
      for (const [cid, days] of Object.entries(dayCount)) billedHHS += days * (rateMap[`${cid}|HHS`] ?? 0);

      const ctrRows = ((ctrQ.data ?? []) as any[]).filter((c) => c.month === mi + 1);
      const net_payroll = ctrRows.reduce((a, c) => a + Number(c.net_pay || 0), 0);
      const additional_pay = ctrRows.reduce((a, c) => a + Number(c.additional_pay || 0), 0);
      const fica = ctrRows.reduce((a, c) => a + Number(c.tax_fica || 0), 0);

      const ledgerMonth = ((ledgerQ.data ?? []) as any[]).filter((l) => l.period_month === mi + 1);
      const federal_tax =
        ledgerMonth.filter((l) => l.category === "payroll_tax" && l.label === "Federal Tax").reduce((a, l) => a + Number(l.amount || 0), 0) ||
        ctrRows.reduce((a, c) => a + Number(c.tax_federal || 0), 0);
      const state_tax =
        ledgerMonth.filter((l) => l.category === "payroll_tax" && l.label === "State Tax").reduce((a, l) => a + Number(l.amount || 0), 0) ||
        ctrRows.reduce((a, c) => a + Number(c.tax_state || 0), 0);

      out.push({ mi, gross: billedDSP + billedHHS, net_payroll, additional_pay, federal_tax, state_tax, fica });
    }
    return out;
  }, [evvQ.data, hhsQ.data, ctrQ.data, ledgerQ.data, rateMap]);

  // Pick scope rows
  const scopeRows = useMemo(() => {
    if (scope === "year") return monthly;
    if (scope === "month") return monthly.filter((m) => m.mi === scopeIdx);
    // quarter
    const startM = scopeIdx * 3;
    return monthly.filter((m) => m.mi >= startM && m.mi < startM + 3);
  }, [monthly, scope, scopeIdx]);

  const scopeAgg = useMemo(() => {
    return scopeRows.reduce(
      (a, m) => ({
        gross: a.gross + m.gross,
        net_payroll: a.net_payroll + m.net_payroll,
        additional_pay: a.additional_pay + m.additional_pay,
        federal_tax: a.federal_tax + m.federal_tax,
        state_tax: a.state_tax + m.state_tax,
        fica: a.fica + m.fica,
      }),
      { gross: 0, net_payroll: 0, additional_pay: 0, federal_tax: 0, state_tax: 0, fica: 0 },
    );
  }, [scopeRows]);

  // Distributable net under selected plan
  const distributable = useMemo(() => {
    if (!selectedPlan) return { afterExpenses: 0, retention: 0, net: 0, selectedExpenses: 0 };
    const sel = selectedPlan.expense_selection ?? {};
    const selectedExpenses =
      (sel.net_payroll ? scopeAgg.net_payroll : 0) +
      (sel.additional_pay ? scopeAgg.additional_pay : 0) +
      (sel.federal_tax ? scopeAgg.federal_tax : 0) +
      (sel.state_tax ? scopeAgg.state_tax : 0) +
      (sel.fica ? scopeAgg.fica : 0);
    const afterExpenses = scopeAgg.gross - selectedExpenses;
    const retention = afterExpenses * (Number(selectedPlan.retention_pct || 0) / 100);
    const net = afterExpenses - retention;
    return { afterExpenses, retention, net, selectedExpenses };
  }, [selectedPlan, scopeAgg]);

  // ---------- Mutations ----------
  const createPlan = useMutation({
    mutationFn: async (vars: { name: string; plan_type: PlanType }) => {
      const { data, error } = await supabase
        .from("distribution_plans" as never)
        .insert({
          organization_id: org!.organization_id,
          name: vars.name,
          plan_type: vars.plan_type,
          retention_pct: 0,
          status: "draft",
          is_active: false,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["dist-plans"] });
      setSelectedPlanId(row.id);
      toast.success("Plan created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePlan = useMutation({
    mutationFn: async (vars: Partial<Plan> & { id: string }) => {
      const { id, ...rest } = vars;
      const { error } = await supabase
        .from("distribution_plans" as never)
        .update(rest as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dist-plans"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("distribution_plans" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dist-plans"] });
      setSelectedPlanId(null);
      toast.success("Plan deleted");
    },
  });

  const duplicatePlan = useMutation({
    mutationFn: async (id: string) => {
      const plan = plansQ.data?.find((p) => p.id === id);
      const parts = partsQ.data ?? [];
      if (!plan) throw new Error("Plan not found");
      const { data: newPlan, error } = await supabase
        .from("distribution_plans" as never)
        .insert({
          organization_id: plan.organization_id,
          name: `${plan.name} (copy)`,
          plan_type: plan.plan_type,
          retention_pct: plan.retention_pct,
          expense_selection: plan.expense_selection,
          formula_json: plan.formula_json,
          nectar_summary: plan.nectar_summary,
          status: "draft",
          is_active: false,
        } as any)
        .select()
        .single();
      if (error) throw error;
      if (parts.length) {
        const inserts = parts.map((p) => ({
          plan_id: (newPlan as any).id,
          participant_name: p.participant_name,
          participant_user_id: p.participant_user_id,
          allocation_pct: p.allocation_pct,
          role_label: p.role_label,
          notes: p.notes,
          sort_order: p.sort_order,
        }));
        const { error: e2 } = await supabase.from("distribution_plan_participants" as never).insert(inserts as any);
        if (e2) throw e2;
      }
      return newPlan as any;
    },
    onSuccess: (row: any) => {
      qc.invalidateQueries({ queryKey: ["dist-plans"] });
      setSelectedPlanId(row.id);
      toast.success("Plan duplicated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addParticipant = useMutation({
    mutationFn: async () => {
      const order = (partsQ.data?.length ?? 0);
      const { error } = await supabase.from("distribution_plan_participants" as never).insert({
        plan_id: selectedPlanId!,
        participant_name: "New participant",
        allocation_pct: 0,
        sort_order: order,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dist-parts", selectedPlanId] }),
  });

  const updateParticipant = useMutation({
    mutationFn: async (vars: Partial<Participant> & { id: string }) => {
      const { id, ...rest } = vars;
      const { error } = await supabase.from("distribution_plan_participants" as never).update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dist-parts", selectedPlanId] }),
  });

  const deleteParticipant = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("distribution_plan_participants" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dist-parts", selectedPlanId] }),
  });

  // Local edit state for plan editor
  const [editName, setEditName] = useState("");
  const [editRetention, setEditRetention] = useState("0");
  const [editExpenses, setEditExpenses] = useState<Record<string, boolean>>({});
  const [editNectarPrompt, setEditNectarPrompt] = useState("");
  useEffect(() => {
    if (selectedPlan) {
      setEditName(selectedPlan.name);
      setEditRetention(String(selectedPlan.retention_pct ?? 0));
      setEditExpenses({ ...(selectedPlan.expense_selection ?? {}) });
    }
  }, [selectedPlan?.id]);

  // Allocation sum validation
  const allocSum = useMemo(
    () => (partsQ.data ?? []).reduce((a, p) => a + Number(p.allocation_pct || 0), 0),
    [partsQ.data],
  );
  const allocDelta = Math.round((100 - allocSum) * 10000) / 10000;
  const allocValid = Math.abs(allocDelta) < 0.0001;

  // NECTAR proposal (deterministic local heuristic — never auto-applies)
  function proposeFormula() {
    const text = editNectarPrompt.toLowerCase();
    const proposal: any = { tiers: [] as any[] };
    const summary: string[] = [];
    const prefMatch = text.match(/preferred\s*(return)?[^\d]*(\d+(\.\d+)?)\s*%/);
    if (prefMatch) {
      proposal.tiers.push({ kind: "preferred_return", pct: Number(prefMatch[2]) });
      summary.push(`${prefMatch[2]}% preferred return paid first.`);
    }
    if (/return\s*of\s*capital/.test(text)) {
      proposal.tiers.push({ kind: "return_of_capital" });
      summary.push("Return of capital to investors next.");
    }
    const splitMatch = text.match(/(\d+)\s*\/\s*(\d+)\s*(split|remainder)?/);
    if (splitMatch) {
      proposal.tiers.push({ kind: "remainder_split", a: Number(splitMatch[1]), b: Number(splitMatch[2]) });
      summary.push(`Remainder split ${splitMatch[1]}/${splitMatch[2]} (sponsor/investor).`);
    }
    if (proposal.tiers.length === 0) {
      proposal.tiers.push({ kind: "flat_split", note: "Even split across listed participants" });
      summary.push("No structured terms detected — defaulting to flat split across participants. Edit and refine.");
    }
    proposal.disclaimer = "NECTAR proposal — provider must review and approve before payouts compute.";
    return { proposal, summary: summary.join(" ") };
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">Distribution Engine</h2>
          <p className="text-sm text-muted-foreground">
            Profit-share / investor / ownership waterfalls. Reads real net from Totals — the math is yours to define.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>◀ {year - 1}</Button>
          <div className="rounded-md border bg-card px-3 py-1.5 text-sm font-medium">{year}</div>
          <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>{year + 1} ▶</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Plan list */}
        <Card className="p-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Saved plans</h3>
            <NewPlanButton onCreate={(name, type) => createPlan.mutate({ name, plan_type: type })} />
          </div>
          <div className="space-y-1">
            {(plansQ.data ?? []).map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`w-full rounded-md border p-2 text-left text-sm transition-colors ${
                  selectedPlanId === p.id ? "border-primary bg-primary/5" : "hover:bg-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{p.name}</span>
                  {p.is_active && <Badge variant="default" className="text-[10px]">Active</Badge>}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{p.plan_type.replace("_", " ")}</span>
                  <Badge variant={p.status === "approved" ? "default" : "secondary"} className="text-[10px]">
                    {p.status}
                  </Badge>
                </div>
              </button>
            ))}
            {!plansQ.data?.length && (
              <p className="text-xs text-muted-foreground italic">No plans yet. Create one to begin.</p>
            )}
          </div>
        </Card>

        {/* Plan editor */}
        {selectedPlan ? (
          <Card className="p-4 space-y-5">
            {/* Header / actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => editName !== selectedPlan.name && updatePlan.mutate({ id: selectedPlan.id, name: editName })}
                  className="h-9 w-72 font-semibold"
                />
                <Badge variant={selectedPlan.status === "approved" ? "default" : "secondary"}>{selectedPlan.status}</Badge>
                {selectedPlan.is_active && <Badge>Active</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => duplicatePlan.mutate(selectedPlan.id)}>
                  <Copy className="mr-1 h-4 w-4" /> Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Mark active (and deactivate others)
                    const others = (plansQ.data ?? []).filter((p) => p.is_active && p.id !== selectedPlan.id);
                    Promise.all(others.map((p) => supabase.from("distribution_plans" as never).update({ is_active: false }).eq("id", p.id))).then(() => {
                      updatePlan.mutate({ id: selectedPlan.id, is_active: !selectedPlan.is_active });
                    });
                  }}
                >
                  {selectedPlan.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Delete plan "${selectedPlan.name}"?`)) deletePlan.mutate(selectedPlan.id);
                  }}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                </Button>
              </div>
            </div>

            {(selectedPlan.plan_type === "investor" || selectedPlan.plan_type === "ownership") && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
                <Info className="mt-0.5 h-4 w-4 text-amber-600" />
                <p>
                  Distribution structures with tax or legal implications are worth confirming with your accountant or attorney.
                  HIVE organizes the math; you own its accuracy.
                </p>
              </div>
            )}

            {/* Retention + expense selection */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Company retention (taken first)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={editRetention}
                    onChange={(e) => setEditRetention(e.target.value)}
                    onBlur={() => {
                      const v = Number(editRetention) || 0;
                      if (v !== Number(selectedPlan.retention_pct)) {
                        updatePlan.mutate({ id: selectedPlan.id, retention_pct: v });
                      }
                    }}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">% of post-expense net</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Retention is removed before the 100% participant split.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Expenses to subtract from gross</Label>
                <div className="space-y-1.5">
                  {EXPENSE_LINES.map((ex) => (
                    <label key={ex.key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={!!editExpenses[ex.key]}
                        onCheckedChange={(c) => {
                          const next = { ...editExpenses, [ex.key]: !!c };
                          setEditExpenses(next);
                          updatePlan.mutate({ id: selectedPlan.id, expense_selection: next });
                        }}
                      />
                      {ex.label}
                    </label>
                  ))}
                </div>
              </div>
            </section>

            {/* Participants */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Participants (must total 100%)</Label>
                <Button size="sm" variant="outline" onClick={() => addParticipant.mutate()}>
                  <Plus className="mr-1 h-4 w-4" /> Add participant
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Role / label</th>
                      <th className="px-3 py-2 text-right">Allocation %</th>
                      <th className="px-3 py-2 text-right">Payout (preview)</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(partsQ.data ?? []).map((p) => {
                      const payout = selectedPlan.status === "approved"
                        ? (distributable.net * (Number(p.allocation_pct || 0) / 100))
                        : null;
                      return (
                        <tr key={p.id} className="border-t">
                          <td className="px-3 py-2">
                            <Input
                              defaultValue={p.participant_name}
                              onBlur={(e) => e.target.value !== p.participant_name && updateParticipant.mutate({ id: p.id, participant_name: e.target.value })}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              defaultValue={p.role_label ?? ""}
                              onBlur={(e) => (e.target.value || null) !== p.role_label && updateParticipant.mutate({ id: p.id, role_label: e.target.value || null })}
                              className="h-8"
                              placeholder="e.g. Founder, LP"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              defaultValue={p.allocation_pct}
                              onBlur={(e) => {
                                const v = Number(e.target.value) || 0;
                                if (v !== Number(p.allocation_pct)) updateParticipant.mutate({ id: p.id, allocation_pct: v });
                              }}
                              className="h-8 w-24 text-right inline-block"
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {payout === null ? <span className="text-xs italic text-muted-foreground">awaiting approval</span> : fmtUSD(payout)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => deleteParticipant.mutate(p.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!partsQ.data?.length && (
                      <tr><td colSpan={5} className="px-3 py-4 text-center text-xs italic text-muted-foreground">No participants yet.</td></tr>
                    )}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td colSpan={2} className="px-3 py-2 text-right font-semibold">Total allocation</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${allocValid ? "text-emerald-600" : "text-destructive"}`}>
                        {allocSum.toFixed(2)}%
                      </td>
                      <td colSpan={2} className="px-3 py-2 text-xs">
                        {allocValid
                          ? <span className="text-emerald-600 inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> 100%</span>
                          : <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {allocDelta > 0 ? `under by ${allocDelta.toFixed(2)}%` : `over by ${Math.abs(allocDelta).toFixed(2)}%`}</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            {/* NECTAR proposal */}
            {(selectedPlan.plan_type === "investor" || selectedPlan.plan_type === "ownership") && (
              <section className="space-y-2 rounded-md border border-dashed p-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-semibold">NECTAR formula proposer</Label>
                  <Badge variant="secondary" className="text-[10px]">proposes, never applies</Badge>
                </div>
                <Textarea
                  placeholder="Describe the deal in plain English. e.g. '8% preferred return, then return of capital, then 70/30 split sponsor/investor.'"
                  value={editNectarPrompt}
                  onChange={(e) => setEditNectarPrompt(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const { proposal, summary } = proposeFormula();
                      updatePlan.mutate({
                        id: selectedPlan.id,
                        formula_json: proposal,
                        nectar_summary: summary,
                        status: "draft",
                        approved_by: null,
                        approved_at: null,
                      } as any);
                      toast.success("Draft proposal saved — review and Approve to enable payouts");
                    }}
                  >
                    <Sparkles className="mr-1 h-4 w-4" /> Propose formula
                  </Button>
                </div>
                {selectedPlan.formula_json && (
                  <div className="mt-2 rounded bg-muted/50 p-2 text-xs">
                    <div className="font-semibold mb-1">Current proposed structure:</div>
                    {selectedPlan.nectar_summary && <p className="mb-1 italic">{selectedPlan.nectar_summary}</p>}
                    <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
                      {JSON.stringify(selectedPlan.formula_json, null, 2)}
                    </pre>
                  </div>
                )}
              </section>
            )}

            {/* Approval bar */}
            <section className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
              <div className="text-xs">
                {selectedPlan.status === "approved" ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <ShieldCheck className="h-4 w-4" /> Approved
                    {selectedPlan.approved_at && ` · ${new Date(selectedPlan.approved_at).toLocaleString()}`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-4 w-4" /> Draft — payouts will not compute until you approve.
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {selectedPlan.status === "approved" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updatePlan.mutate({ id: selectedPlan.id, status: "draft", approved_by: null, approved_at: null } as any)}
                  >
                    Revert to draft
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={!allocValid}
                    title={!allocValid ? "Allocations must total exactly 100%" : ""}
                    onClick={async () => {
                      const { data: u } = await supabase.auth.getUser();
                      updatePlan.mutate({
                        id: selectedPlan.id,
                        status: "approved",
                        approved_by: u.user?.id ?? null,
                        approved_at: new Date().toISOString(),
                      } as any);
                      toast.success("Plan approved — payouts now compute from real data");
                    }}
                  >
                    <Save className="mr-1 h-4 w-4" /> Approve plan
                  </Button>
                )}
              </div>
            </section>

            {/* Payout preview */}
            <section className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-semibold">Payout preview</Label>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Select value={scope} onValueChange={(v: any) => setScope(v)}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="year">Full year</SelectItem>
                      <SelectItem value="quarter">Quarter</SelectItem>
                      <SelectItem value="month">Month</SelectItem>
                    </SelectContent>
                  </Select>
                  {scope === "quarter" && (
                    <Select value={String(scopeIdx)} onValueChange={(v) => setScopeIdx(Number(v))}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[0, 1, 2, 3].map((q) => <SelectItem key={q} value={String(q)}>Q{q + 1}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {scope === "month" && (
                    <Select value={String(scopeIdx)} onValueChange={(v) => setScopeIdx(Number(v))}>
                      <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {new Date(year, i, 1).toLocaleString(undefined, { month: "long" })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Gross billed" value={fmtUSD(scopeAgg.gross)} />
                <Stat label="Selected expenses" value={`− ${fmtUSD(distributable.selectedExpenses)}`} />
                <Stat label={`Retention (${selectedPlan.retention_pct}%)`} value={`− ${fmtUSD(distributable.retention)}`} />
                <Stat
                  label="Distributable net"
                  value={fmtUSD(distributable.net)}
                  highlight={selectedPlan.status === "approved"}
                />
              </div>
              {selectedPlan.status !== "approved" && (
                <p className="text-xs italic text-amber-600">
                  Payouts in the participants table will appear after you approve this plan.
                </p>
              )}
            </section>
          </Card>
        ) : (
          <Card className="flex h-48 items-center justify-center p-6 text-sm text-muted-foreground">
            Select or create a plan to begin.
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "border-primary bg-primary/5" : "bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-base font-semibold">{value}</div>
    </div>
  );
}

function NewPlanButton({ onCreate }: { onCreate: (name: string, type: PlanType) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<PlanType>("profit_share");
  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> New
      </Button>
    );
  }
  return (
    <div className="absolute z-10 mt-1 w-64 rounded-md border bg-popover p-2 shadow-md">
      <Input placeholder="Plan name" value={name} onChange={(e) => setName(e.target.value)} className="mb-2 h-8" />
      <Select value={type} onValueChange={(v: any) => setType(v)}>
        <SelectTrigger className="mb-2 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="profit_share">Profit share</SelectItem>
          <SelectItem value="investor">Investor</SelectItem>
          <SelectItem value="ownership">Ownership</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={!name.trim()} onClick={() => { onCreate(name.trim(), type); setOpen(false); setName(""); }}>Create</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
