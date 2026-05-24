import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle, BellRing, FileText, ShieldCheck, Pill, ClipboardSignature, Search, Wrench,
} from "lucide-react";
import { toast } from "sonner";

type Range = "week" | "month" | "90d";
const EMERGENCY_RX = /\b(seizure|injury|fall|fell|hospital|ambulance|er visit|bleeding|unresponsive|behavioral seizure)\b/i;

function rangeBounds(r: Range) {
  const end = new Date();
  const start = new Date();
  if (r === "week") start.setDate(end.getDate() - 7);
  else if (r === "month") start.setDate(end.getDate() - 30);
  else start.setDate(end.getDate() - 90);
  start.setHours(0, 0, 0, 0);
  return { start, end, label: r === "week" ? "Past 7 Days" : r === "month" ? "Past 30 Days" : "Past 90 Days" };
}

type Gap = {
  key: string;
  type: "shift_note" | "emar" | "incident_form" | "monthly_summary";
  refDate: string;
  responsibleStaffId: string | null;
  responsibleStaffName: string;
  label: string;
  detail: string;
  clientId: string;
  shiftId: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  shiftsCount: number;
  notesPct: number;
  emarPct: number;
  triggeredPct: number;
  monthlyPct: number;
  overall: number;
  gaps: Gap[];
  hasCriticalIncident: boolean;
};

function monthsInRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  while (d <= end) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

export function ClientChartAuditMatrix() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("month");
  const [drawerClient, setDrawerClient] = useState<ClientRow | null>(null);

  const { start, end, label } = rangeBounds(range);

  const { data, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["client-chart-audit", org?.organization_id, range],
    queryFn: async (): Promise<{ rows: ClientRow[] }> => {
      const orgId = org!.organization_id;
      const [{ data: clients }, { data: profs }] = await Promise.all([
        supabase.from("clients").select("id, first_name, last_name").eq("organization_id", orgId),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
      const profName = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.email || "Staff"]));

      const [{ data: shifts }, { data: notes }, { data: logs }, { data: forms }, { data: overrides }] = await Promise.all([
        supabase.from("shifts").select("id, user_id, client_id, job_code, clock_in_time")
          .eq("organization_id", orgId)
          .gte("clock_in_time", start.toISOString()).lte("clock_in_time", end.toISOString())
          .not("clock_out_time", "is", null),
        supabase.from("shift_notes").select("shift_id, user_id, narrative_summary"),
        supabase.from("daily_logs").select("id, user_id, client_id, narrative, log_date")
          .eq("organization_id", orgId).gte("log_date", start.toISOString().slice(0, 10)),
        supabase.from("submitted_forms").select("id, user_id, client_id, form_type, occurred_at, narrative")
          .eq("organization_id", orgId).gte("occurred_at", start.toISOString()),
        supabase.from("compliance_overrides").select("gap_key, staff_id").eq("organization_id", orgId),
      ]);

      const noteByShift = new Map((notes ?? []).map((n) => [n.shift_id, n]));
      const overrideKeys = new Set((overrides ?? []).map((o) => o.gap_key));
      const months = monthsInRange(start, end);

      const rows: ClientRow[] = (clients ?? []).map((c) => {
        const cName = `${c.first_name} ${c.last_name}`.trim();
        const cShifts = (shifts ?? []).filter((s) => s.client_id === c.id);
        const cLogs = (logs ?? []).filter((l) => l.client_id === c.id);
        const cForms = (forms ?? []).filter((f) => f.client_id === c.id);
        const gaps: Gap[] = [];

        // 1. Daily Notes / Shift Summaries — every shift needs a shift_note
        let notesOk = 0;
        cShifts.forEach((s) => {
          const key = `client_shift_note:${s.id}`;
          if (noteByShift.has(s.id)) {
            notesOk++;
          } else if (!overrideKeys.has(key)) {
            const d = s.clock_in_time ? new Date(s.clock_in_time) : new Date();
            const staff = profName.get(s.user_id) || "Unassigned";
            gaps.push({
              key,
              type: "shift_note",
              refDate: d.toISOString().slice(0, 10),
              responsibleStaffId: s.user_id,
              responsibleStaffName: staff,
              label: "Missing Daily Note",
              detail: `${s.job_code || "Shift"} — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Assigned Staff: ${staff}.`,
              clientId: c.id,
              shiftId: s.id,
            });
          } else {
            notesOk++;
          }
        });
        const notesPct = cShifts.length ? Math.round((notesOk / cShifts.length) * 100) : 100;

        // 2. eMAR Med Pass — each shift should have a signed med-pass row (proxy: matching daily_log on same day OR shift_note narrative present)
        let emarOk = 0;
        cShifts.forEach((s) => {
          const key = `client_emar:${s.id}`;
          const day = s.clock_in_time ? new Date(s.clock_in_time).toISOString().slice(0, 10) : "";
          const matched = (cLogs.some((l) => l.log_date === day) || (noteByShift.get(s.id)?.narrative_summary?.length ?? 0) > 0);
          if (matched || overrideKeys.has(key)) {
            emarOk++;
          } else {
            const staff = profName.get(s.user_id) || "Unassigned";
            gaps.push({
              key,
              type: "emar",
              refDate: day,
              responsibleStaffId: s.user_id,
              responsibleStaffName: staff,
              label: "Unsigned eMAR Med Pass",
              detail: `Medication window — ${new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}. Responsible Staff: ${staff}.`,
              clientId: c.id,
              shiftId: s.id,
            });
          }
        });
        const emarPct = cShifts.length ? Math.round((emarOk / cShifts.length) * 100) : 100;

        // 3. Triggered Critical Incidents — emergency keyword in any log/note requires incident_report form within 72h
        const triggers: { id: string; date: string; userId: string }[] = [];
        cLogs.forEach((l) => {
          if (EMERGENCY_RX.test(l.narrative || "")) triggers.push({ id: l.id, date: l.log_date, userId: l.user_id });
        });
        // also from shift_notes attached to this client's shifts
        cShifts.forEach((s) => {
          const n = noteByShift.get(s.id);
          if (n?.narrative_summary && EMERGENCY_RX.test(n.narrative_summary)) {
            const d = s.clock_in_time ? new Date(s.clock_in_time).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
            triggers.push({ id: s.id, date: d, userId: s.user_id });
          }
        });
        let triggerOk = 0;
        let critical = false;
        triggers.forEach((t) => {
          const key = `client_incident:${t.id}`;
          const tDate = new Date(t.date).getTime();
          const matched = cForms.some((f) => f.form_type === "incident_report" && Math.abs(new Date(f.occurred_at).getTime() - tDate) <= 1000 * 60 * 60 * 72);
          if (matched || overrideKeys.has(key)) {
            triggerOk++;
          } else {
            critical = true;
            const staff = profName.get(t.userId) || "Unassigned";
            gaps.push({
              key,
              type: "incident_form",
              refDate: t.date,
              responsibleStaffId: t.userId,
              responsibleStaffName: staff,
              label: "Missing Form: Incident Report",
              detail: `Required for behavioral/medical event logged on ${new Date(t.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} by Staff: ${staff}.`,
              clientId: c.id,
              shiftId: null,
            });
          }
        });
        const triggeredPct = triggers.length === 0 ? 100 : Math.round((triggerOk / triggers.length) * 100);

        // 4. Signed Monthly Progress Summaries — for each month a service occurred, require a medical_summary form
        const activeMonths = new Set<string>();
        cShifts.forEach((s) => {
          if (!s.clock_in_time) return;
          const d = new Date(s.clock_in_time);
          activeMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        });
        cLogs.forEach((l) => {
          const d = new Date(l.log_date);
          activeMonths.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        });
        const monthsToCheck = months.filter((m) => activeMonths.has(m));
        let monthlyOk = 0;
        monthsToCheck.forEach((m) => {
          const matched = cForms.some((f) => f.form_type === "medical_summary" && f.occurred_at.startsWith(m));
          const key = `client_monthly:${c.id}:${m}`;
          if (matched || overrideKeys.has(key)) {
            monthlyOk++;
          } else {
            const [yy, mm] = m.split("-");
            const dt = new Date(Number(yy), Number(mm) - 1, 15);
            gaps.push({
              key,
              type: "monthly_summary",
              refDate: `${m}-15`,
              responsibleStaffId: null,
              responsibleStaffName: "Program Coordinator",
              label: "Unsigned Monthly Progress Summary",
              detail: `${dt.toLocaleDateString(undefined, { month: "long", year: "numeric" })} signed summary not on file.`,
              clientId: c.id,
              shiftId: null,
            });
          }
        });
        const monthlyPct = monthsToCheck.length ? Math.round((monthlyOk / monthsToCheck.length) * 100) : 100;

        const overall = Math.round((notesPct + emarPct + triggeredPct + monthlyPct) / 4);

        return {
          id: c.id,
          name: cName,
          shiftsCount: cShifts.length,
          notesPct,
          emarPct,
          triggeredPct,
          monthlyPct,
          overall,
          gaps,
          hasCriticalIncident: critical,
        };
      }).sort((a, b) => a.overall - b.overall);

      return { rows };
    },
  });

  const nudgeMut = useMutation({
    mutationFn: async (args: { client: ClientRow; gap: Gap }) => {
      if (!args.gap.responsibleStaffId) throw new Error("No responsible staff to nudge for this gap.");
      const { error } = await supabase.from("staff_nudges").insert({
        organization_id: org!.organization_id,
        staff_id: args.gap.responsibleStaffId,
        gap_type: args.gap.type,
        gap_reference_date: args.gap.refDate,
        gap_key: args.gap.key,
        message: `🚨 Action Required: An administrative chart audit has flagged missing documentation for your client ${args.client.name} on ${args.gap.refDate}. Please complete this entry immediately to prevent billing holds.`,
        priority: "urgent",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Urgent nudge pinned to staff 📲"),
    onError: (e: Error) => toast.error(e.message),
  });

  const overrideMut = useMutation({
    mutationFn: async (args: { client: ClientRow; gap: Gap; reason: string }) => {
      const { error } = await supabase.from("compliance_overrides").insert({
        organization_id: org!.organization_id,
        staff_id: args.gap.responsibleStaffId ?? user!.id,
        gap_type: args.gap.type,
        gap_reference_date: args.gap.refDate,
        gap_key: args.gap.key,
        reason: args.reason,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gap resolved via Administrative Chart Waiver ⚙️");
      qc.invalidateQueries({ queryKey: ["client-chart-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshedClient = useMemo(() => {
    if (!drawerClient || !data) return drawerClient;
    return data.rows.find((r) => r.id === drawerClient.id) ?? drawerClient;
  }, [drawerClient, data]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <span className="text-base">🛡️</span> Live Case File Chart Audit Matrix
          </h3>
          <p className="text-xs text-muted-foreground">
            Per-client audit readiness — daily notes, eMAR med passes, triggered incident forms, and monthly summaries · {label}
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Audit This Week</SelectItem>
            <SelectItem value="month">Audit Current Month</SelectItem>
            <SelectItem value="90d">Audit Past 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Client Chart</th>
              <th className="py-2 px-2 font-medium"><FileText className="inline h-3 w-3" /> Daily Notes</th>
              <th className="py-2 px-2 font-medium"><Pill className="inline h-3 w-3" /> eMAR</th>
              <th className="py-2 px-2 font-medium"><AlertTriangle className="inline h-3 w-3" /> Incidents</th>
              <th className="py-2 px-2 font-medium"><ClipboardSignature className="inline h-3 w-3" /> Monthly</th>
              <th className="py-2 px-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading chart audit…</td></tr>
            )}
            {!isLoading && !data?.rows.length && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No clients in directory yet.</td></tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <OverallBadge pct={r.overall} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.shiftsCount} shift{r.shiftsCount === 1 ? "" : "s"} · {r.gaps.length} open gap{r.gaps.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {r.hasCriticalIncident && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> 🚨 Awaiting Incident Report Form
                    </div>
                  )}
                </td>
                <td className="py-3 px-2"><MetricCell pct={r.notesPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.emarPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.triggeredPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.monthlyPct} /></td>
                <td className="py-3 px-2 text-right">
                  {r.overall < 100 ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                      onClick={() => setDrawerClient(r)}>
                      <Search className="h-3.5 w-3.5 text-amber-500" /> 🔍 Audit Chart
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> Audit-Ready
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawerClient} onOpenChange={(o) => { if (!o) setDrawerClient(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Search className="h-4 w-4 text-amber-500" /> Chart Reconciliation Desk: {refreshedClient?.name}
            </SheetTitle>
            <SheetDescription>
              {refreshedClient?.gaps.length ?? 0} outstanding chart gap{(refreshedClient?.gaps.length ?? 0) === 1 ? "" : "s"} in {label.toLowerCase()}.
              Nudge the responsible caregiver or file an administrative waiver.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-3">
            {!refreshedClient?.gaps.length && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                ✅ Chart fully reconciled. Audit readiness restored to 100%.
              </div>
            )}
            {refreshedClient?.gaps
              .slice()
              .sort((a, b) => a.refDate.localeCompare(b.refDate))
              .map((g) => (
                <GapItem
                  key={g.key}
                  gap={g}
                  orgId={org!.organization_id}
                  adminUserId={user!.id}
                  onNudge={() => nudgeMut.mutate({ client: refreshedClient, gap: g })}
                  onOverride={(reason) => overrideMut.mutate({ client: refreshedClient, gap: g, reason })}
                  onResolved={() => qc.invalidateQueries({ queryKey: ["client-chart-audit"] })}
                  isNudging={nudgeMut.isPending}
                  isOverriding={overrideMut.isPending}
                />

              ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OverallBadge({ pct }: { pct: number }) {
  const tone = pct >= 95 ? "emerald" : pct >= 60 ? "amber" : "red";
  const dot = tone === "emerald" ? "🟢" : tone === "amber" ? "🟡" : "🔴";
  const label = tone === "emerald" ? "Audit-Ready" : tone === "amber" ? "Chart Gaps" : "High Risk Gaps";
  const cls = tone === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return (
    <Badge variant="outline" className={`shrink-0 font-mono text-[11px] ${cls}`} title={label}>
      {dot} {pct}% {label}
    </Badge>
  );
}

function MetricCell({ pct }: { pct: number }) {
  const tone = pct >= 95 ? "emerald" : pct >= 60 ? "amber" : "red";
  const cls = tone === "emerald"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    : tone === "amber"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <span className={`inline-flex w-12 justify-center rounded-md px-2 py-1 font-mono text-[11px] font-semibold tabular-nums ${cls}`}>
      {pct}%
    </span>
  );
}

function GapItem({
  gap, orgId, adminUserId, onNudge, onOverride, onResolved, isNudging, isOverriding,
}: {
  gap: Gap;
  orgId: string;
  adminUserId: string;
  onNudge: () => void;
  onOverride: (reason: string) => void;
  onResolved: () => void;
  isNudging: boolean;
  isOverriding: boolean;
}) {
  const [mode, setMode] = useState<null | "resolve" | "waiver">(null);
  const [reason, setReason] = useState("");
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  // Late-entry shift note / daily log
  const [narrative, setNarrative] = useState("");

  // Incident / monthly form
  const [formTitle, setFormTitle] = useState(
    gap.type === "incident_form" ? "Incident Report (Admin Late-Filed)" :
    gap.type === "monthly_summary" ? "Monthly Progress Summary" : ""
  );
  const [formNarrative, setFormNarrative] = useState("");

  // eMAR attestation
  const [emarChecked, setEmarChecked] = useState(false);

  const icon = gap.type === "incident_form" ? "🚨" : "❌";
  const accent = gap.type === "incident_form" ? "border-red-500/40 bg-red-500/5" : "border-border";

  const finishResolve = async (overrideReason: string) => {
    // Always also write a compliance_override so the gap key is suppressed if the source row doesn't match exactly.
    const { error: ovErr } = await supabase.from("compliance_overrides").insert({
      organization_id: orgId,
      staff_id: gap.responsibleStaffId ?? adminUserId,
      gap_type: gap.type,
      gap_reference_date: gap.refDate,
      gap_key: gap.key,
      reason: overrideReason,
      created_by: adminUserId,
    });
    if (ovErr) throw ovErr;
  };

  const resolveLateNote = async () => {
    if (!narrative.trim()) { toast.error("Enter a progress narrative first"); return; }
    setBusy(true);
    try {
      if (gap.shiftId) {
        const { error } = await supabase.from("shift_notes").insert({
          shift_id: gap.shiftId,
          user_id: adminUserId,
          narrative_summary: `[FILED_BY_ADMIN_OVERRIDE @ ${new Date().toISOString()}] ${narrative.trim()}`,
          goals_addressed: [],
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("daily_logs").insert({
          organization_id: orgId,
          user_id: adminUserId,
          client_id: gap.clientId,
          log_date: gap.refDate,
          narrative: `[FILED_BY_ADMIN_OVERRIDE @ ${new Date().toISOString()}] ${narrative.trim()}`,
          pcsp_goals_addressed: [],
          status: "filed_by_admin_override",
        });
        if (error) throw error;
      }
      await finishResolve(`Late-entry notation filed by admin: "${narrative.trim().slice(0, 120)}"`);
      toast.success("✅ Late entry filed — chart recalculating");
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resolveForm = async () => {
    if (!formNarrative.trim()) { toast.error("Enter the clinical narrative"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("submitted_forms").insert({
        organization_id: orgId,
        client_id: gap.clientId,
        user_id: gap.responsibleStaffId ?? adminUserId,
        form_type: gap.type === "incident_form" ? "incident_report" : "medical_summary",
        title: formTitle.trim() || (gap.type === "incident_form" ? "Incident Report" : "Monthly Summary"),
        narrative: `[FILED_BY_ADMIN_OVERRIDE @ ${new Date().toISOString()}] ${formNarrative.trim()}`,
        occurred_at: new Date(gap.refDate).toISOString(),
        payload: { filed_by_admin: adminUserId, original_gap_key: gap.key },
      });
      if (error) throw error;
      await finishResolve(`${gap.label} filed by admin with locked client/date/staff context.`);
      toast.success("✅ Form filed & signed — chart recalculating");
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const resolveEmar = async () => {
    if (!emarChecked) { toast.error("Check the physical-count attestation"); return; }
    setBusy(true);
    try {
      await finishResolve(`eMAR physical pill-count verified & signed by admin credentials [${adminUserId.slice(0, 8)}] @ ${new Date().toISOString()}`);
      toast.success("✅ eMAR attestation signed — chart recalculating");
      onResolved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-lg border ${accent} bg-background p-3`}>
      <p className="text-sm font-medium">{icon} {gap.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{gap.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pinned || isNudging || !gap.responsibleStaffId}
          className="h-7 gap-1 text-[11px]"
          onClick={() => { onNudge(); setPinned(true); }}
        >
          {pinned ? <>✓ Staff Pinned</> : <><BellRing className="h-3 w-3" /> 🔔 Nudge Responsible Staff</>}
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 text-[11px]"
          onClick={() => setMode((m) => m === "resolve" ? null : "resolve")}
        >
          <Wrench className="h-3 w-3" /> ⚙️ Resolve &amp; File Form Now
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[11px]"
          onClick={() => setMode((m) => m === "waiver" ? null : "waiver")}
        >
          Waiver only
        </Button>
      </div>

      {mode === "resolve" && (gap.type === "shift_note") && (
        <div className="mt-3 space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-primary">📝 Admin Late-Entry Notation</Label>
          <Textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Type the progress summary on behalf of the agency (what occurred, goals addressed, client response)…"
            className="min-h-[100px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={busy} onClick={resolveLateNote}>
              {busy ? "Filing…" : "Submit Administrative Entry"}
            </Button>
          </div>
        </div>
      )}

      {mode === "resolve" && (gap.type === "incident_form" || gap.type === "monthly_summary") && (
        <div className="mt-3 space-y-2 rounded-md border border-red-500/30 bg-red-500/5 p-3">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
            🚨 Pre-Filled {gap.type === "incident_form" ? "Incident Report" : "Monthly Summary"}
          </Label>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2 text-[10px] font-mono">
            <div><span className="text-muted-foreground">Client ID:</span> <span className="opacity-70">🔒 {gap.clientId.slice(0, 8)}…</span></div>
            <div><span className="text-muted-foreground">Service Date:</span> <span className="opacity-70">🔒 {gap.refDate}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">Staff:</span> <span className="opacity-70">🔒 {gap.responsibleStaffName}</span></div>
          </div>
          <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Form title" className="h-8 text-xs" />
          <Textarea
            value={formNarrative}
            onChange={(e) => setFormNarrative(e.target.value)}
            placeholder="Clinical narrative — describe the event, intervention, and outcome…"
            className="min-h-[110px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={busy} onClick={resolveForm}>
              {busy ? "Filing…" : "File Form & Sign"}
            </Button>
          </div>
        </div>
      )}

      {mode === "resolve" && gap.type === "emar" && (
        <div className="mt-3 space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            ⚠️ Confirm Physical Count Verification
          </Label>
          <label className="flex items-start gap-2 rounded-md bg-background/60 p-2 text-xs">
            <Checkbox checked={emarChecked} onCheckedChange={(v) => setEmarChecked(Boolean(v))} className="mt-0.5" />
            <span>✅ I have verified via physical pill-count / log-sheet audit that this medication was successfully administered on {gap.refDate}.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setMode(null)}>Cancel</Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={busy || !emarChecked} onClick={resolveEmar}>
              {busy ? "Signing…" : "Confirm Override"}
            </Button>
          </div>
        </div>
      )}

      {mode === "waiver" && (
        <div className="mt-2 space-y-2 rounded-md border border-border/70 bg-muted/40 p-2">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Client was on a family leave home-visit; documentation waived by Director."
            className="min-h-[64px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => { setMode(null); setReason(""); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-[11px]" disabled={!reason.trim() || isOverriding} onClick={() => onOverride(reason.trim())}>
              {isOverriding ? "Saving…" : "Save Waiver"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

      )}
    </div>
  );
}
