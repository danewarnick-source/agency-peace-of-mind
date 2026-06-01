import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useClientBudget } from "@/hooks/use-client-budget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Pencil, Check, X, ExternalLink, IdCard, CalendarRange, Receipt, AlertTriangle } from "lucide-react";
import { isDailyServiceCode } from "@/lib/service-billing";

type Props = {
  clientId: string;
  clientName: string;
  medicaidId: string | null;
};

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

/**
 * Per-code billing detail rendered inside the Client Profile, beneath the
 * Authorized DSPD Billing Codes multi-select. Shows one frosted card per
 * authorized code with annual / used / remaining units and dollar figures
 * derived from the live billing ledger. Admins can inline-edit annual
 * authorization and rate; full editing (start/end dates, monthly cap,
 * approver, etc.) opens the existing /dashboard/billing/$clientId editor.
 */
export function BillingCodesDetail({ clientId, clientName, medicaidId }: Props) {
  const { data: budgets, isLoading } = useClientBudget(clientId);

  // Plan year header: earliest period_start → latest period_end across all
  // authorized codes (PCSP plan year). Falls back gracefully when missing.
  const planYear = useMemo(() => {
    if (!budgets || budgets.length === 0) return { start: null as Date | null, end: null as Date | null };
    let start: Date | null = null;
    let end: Date | null = null;
    for (const b of budgets) {
      if (b.period_start && (!start || b.period_start < start)) start = b.period_start;
      if (b.period_end && (!end || b.period_end > end)) end = b.period_end;
    }
    return { start, end };
  }, [budgets]);

  return (
    <Card className="border-amber-500/20 bg-card/60 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Billing Codes Detail
            </CardTitle>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Live unit ledger per authorized DSPD code. Used units pull from EVV punches and daily logs.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-xs">
            <Link to="/dashboard/billing/$clientId" params={{ clientId }}>
              <ExternalLink className="h-3.5 w-3.5" /> Full billing editor
            </Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Identity strip */}
        <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field icon={<IdCard className="h-3.5 w-3.5" />} label="Client">
              <span className="font-semibold">{clientName}</span>
            </Field>
            <Field icon={<Receipt className="h-3.5 w-3.5" />} label="Individual Medicaid ID">
              <span className="font-mono">{medicaidId || "—"}</span>
            </Field>
            <Field icon={<CalendarRange className="h-3.5 w-3.5" />} label="Plan Year Renewal">
              <span className="font-semibold text-amber-700 dark:text-amber-300">
                {fmtDate(planYear.start)} – {fmtDate(planYear.end)}
              </span>
            </Field>
          </div>
        </div>

        {/* Per-code cards */}
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : !budgets || budgets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/40 p-6 text-center">
            <p className="text-sm font-medium">No authorized billing codes yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Add codes via the multi-select above, then open the full billing editor to set annual units, rates, and the plan year window.
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3 gap-1.5 text-xs">
              <Link to="/dashboard/billing/$clientId" params={{ clientId }}>
                <ExternalLink className="h-3.5 w-3.5" /> Open billing editor
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {budgets.map((b) => (
              <CodeRow key={b.code.id} clientId={clientId} budget={b} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

type Budget = NonNullable<ReturnType<typeof useClientBudget>["data"]>[number];

function CodeRow({ clientId, budget }: { clientId: string; budget: Budget }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const code = budget.code;
  const isDaily = isDailyServiceCode(code.service_code);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annual, setAnnual] = useState<string>(String(code.annual_unit_authorization ?? 0));
  const [rate, setRate] = useState<string>(String(code.rate_per_unit ?? 0));

  const usedUnits = budget.used_units;
  const annualUnits = code.annual_unit_authorization ?? 0;
  const rateNum = Number(code.rate_per_unit ?? 0);
  const remainingUnits = Math.max(0, annualUnits - usedUnits);
  const totalBilled = usedUnits * rateNum;
  const remainingBudget = remainingUnits * rateNum;
  const pct = annualUnits > 0 ? Math.min(100, (usedUnits / annualUnits) * 100) : 0;

  const exhausted = annualUnits > 0 && usedUnits >= annualUnits;
  const isEmpty = usedUnits === 0;

  async function handleSave() {
    if (!org?.organization_id) return;
    const a = Number(annual);
    const r = Number(rate);
    if (!isFinite(a) || a < 0) return toast.error("Annual units must be a non-negative number");
    if (!isFinite(r) || r < 0) return toast.error("Rate must be a non-negative number");
    setSaving(true);
    const { error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("client_billing_codes" as any)
      .update({ annual_unit_authorization: a, rate_per_unit: r })
      .eq("id", code.id)
      .eq("organization_id", org.organization_id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${code.service_code} updated`);
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["all-client-billing-codes"] });
    qc.invalidateQueries({ queryKey: ["client-billing-codes"] });
    qc.invalidateQueries({ queryKey: ["client-budget"] });
  }

  function handleCancel() {
    setAnnual(String(code.annual_unit_authorization ?? 0));
    setRate(String(code.rate_per_unit ?? 0));
    setEditing(false);
  }

  const unitLabel = isDaily ? "days" : "units";

  return (
    <div className="rounded-xl border border-border bg-background/60 p-4 shadow-sm">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge className="bg-primary/10 font-mono text-primary hover:bg-primary/10">{code.service_code}</Badge>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {isDaily ? "Daily code" : "Hourly code · 1 hr = 4 units"}
          </span>
          {exhausted && (
            <Badge variant="destructive" className="gap-1 text-[10px]">
              <AlertTriangle className="h-3 w-3" /> Authorization exhausted
            </Badge>
          )}
          {!exhausted && isEmpty && (
            <Badge variant="outline" className="text-[10px]">No usage logged yet</Badge>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={handleCancel} disabled={saving} className="h-7 gap-1 text-xs">
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="h-7 gap-1 text-xs">
              <Check className="h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)} className="h-7 gap-1 text-xs">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Stats grid */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={`Annual ${unitLabel}`}>
          {editing ? (
            <Input
              type="number"
              min={0}
              value={annual}
              onChange={(e) => setAnnual(e.target.value)}
              className="h-8 font-mono text-sm"
            />
          ) : (
            <span className="font-mono text-sm font-semibold tabular-nums">{annualUnits.toLocaleString()}</span>
          )}
        </Stat>
        <Stat label={`Used ${unitLabel}`}>
          <span className="font-mono text-sm font-semibold tabular-nums">{usedUnits.toLocaleString()}</span>
        </Stat>
        <Stat label={`Remaining ${unitLabel}`}>
          <span className="font-mono text-sm font-semibold tabular-nums">{remainingUnits.toLocaleString()}</span>
        </Stat>
        <Stat label="Rate / unit">
          {editing ? (
            <Input
              type="number"
              min={0}
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="h-8 font-mono text-sm"
            />
          ) : (
            <span className="font-mono text-sm font-semibold tabular-nums">{fmtMoney(rateNum)}</span>
          )}
        </Stat>
        <Stat label="Total billed">
          <span className="font-mono text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {fmtMoney(totalBilled)}
          </span>
        </Stat>
        <Stat label="Remaining budget">
          <span className="font-mono text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300">
            {fmtMoney(remainingBudget)}
          </span>
        </Stat>
      </div>

      {/* Usage bar */}
      {annualUnits > 0 && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all ${
                exhausted
                  ? "bg-destructive"
                  : pct >= 80
                    ? "bg-amber-500"
                    : "bg-primary"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {pct.toFixed(0)}% of authorization used
            {code.service_start_date && code.service_end_date && (
              <> · plan window {code.service_start_date} → {code.service_end_date}</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
