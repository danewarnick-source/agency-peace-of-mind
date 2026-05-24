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
import { AlertTriangle, BellRing, FileText, GraduationCap, ShieldCheck, Stethoscope, Zap } from "lucide-react";
import { toast } from "sonner";

type Range = "week" | "month" | "90d";
const EMERGENCY_RX = /\b(seizure|injury|fall|fell|hospital|ambulance|er visit|bleeding|unresponsive)\b/i;

function rangeBounds(r: Range): { start: Date; end: Date; label: string } {
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
  type: "shift_note" | "incident_form" | "training";
  refDate: string; // YYYY-MM-DD
  label: string;
  detail: string;
};

type StaffRow = {
  id: string;
  name: string;
  shiftsCount: number;
  notesPct: number;
  logsPct: number;
  triggeredPct: number;
  trainingPct: number;
  overall: number;
  gaps: Gap[];
  hasCriticalIncident: boolean;
};

export function ComplianceMatrix() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [range, setRange] = useState<Range>("week");
  const [drawerStaff, setDrawerStaff] = useState<StaffRow | null>(null);

  const { start, end, label } = rangeBounds(range);

  const { data, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["compliance-matrix", org?.organization_id, range],
    queryFn: async (): Promise<{ rows: StaffRow[]; totalModules: number }> => {
      const orgId = org!.organization_id;
      const [{ data: mems }, { count: totalModules }] = await Promise.all([
        supabase.from("organization_members").select("user_id").eq("organization_id", orgId).eq("active", true),
        supabase.from("training_modules").select("*", { count: "exact", head: true }),
      ]);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return { rows: [], totalModules: totalModules ?? 6 };

      const [{ data: profs }, { data: shifts }, { data: notes }, { data: logs }, { data: forms }, { data: training }, { data: overrides }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email").in("id", ids),
        supabase.from("shifts").select("id, user_id, client_id, job_code, clock_in_time")
          .eq("organization_id", orgId).in("user_id", ids)
          .gte("clock_in_time", start.toISOString()).lte("clock_in_time", end.toISOString())
          .not("clock_out_time", "is", null),
        supabase.from("shift_notes").select("shift_id, user_id").in("user_id", ids),
        supabase.from("daily_logs").select("id, user_id, client_id, narrative, log_date")
          .eq("organization_id", orgId).in("user_id", ids)
          .gte("log_date", start.toISOString().slice(0, 10)),
        supabase.from("submitted_forms").select("id, user_id, client_id, form_type, occurred_at")
          .eq("organization_id", orgId).in("user_id", ids)
          .gte("occurred_at", start.toISOString()),
        supabase.from("user_training_progress").select("user_id, is_completed").in("user_id", ids),
        supabase.from("compliance_overrides").select("staff_id, gap_key").eq("organization_id", orgId),
      ]);

      const { data: clientRows } = await supabase
        .from("clients").select("id, first_name, last_name").eq("organization_id", orgId);
      const clientName = new Map((clientRows ?? []).map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]));

      const overrideSet = new Set((overrides ?? []).map((o) => `${o.staff_id}|${o.gap_key}`));
      const noteShiftIds = new Set((notes ?? []).map((n) => n.shift_id));
      const tot = totalModules ?? 6;

      const rows: StaffRow[] = (profs ?? []).map((p) => {
        const userShifts = (shifts ?? []).filter((s) => s.user_id === p.id);
        const userLogs = (logs ?? []).filter((l) => l.user_id === p.id);
        const userForms = (forms ?? []).filter((f) => f.user_id === p.id);
        const userTraining = (training ?? []).filter((t) => t.user_id === p.id && t.is_completed).length;

        const gaps: Gap[] = [];

        // Shift notes
        userShifts.forEach((s) => {
          const gKey = `shift_note:${s.id}`;
          if (!noteShiftIds.has(s.id) && !overrideSet.has(`${p.id}|${gKey}`)) {
            const d = s.clock_in_time ? new Date(s.clock_in_time) : new Date();
            gaps.push({
              key: gKey,
              type: "shift_note",
              refDate: d.toISOString().slice(0, 10),
              label: `Missing Shift Note`,
              detail: `${clientName.get(s.client_id ?? "") || "Client"} (${s.job_code || "—"}) — ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            });
          }
        });
        const notesTotal = userShifts.length;
        const notesOk = userShifts.length - gaps.filter((g) => g.type === "shift_note").length;
        const notesPct = notesTotal ? Math.round((notesOk / notesTotal) * 100) : 100;

        // Triggered incident reports (from daily logs containing emergency keywords)
        let triggerTotal = 0;
        let triggerOk = 0;
        let critical = false;
        userLogs.forEach((l) => {
          if (EMERGENCY_RX.test(l.narrative || "")) {
            triggerTotal++;
            const logDate = new Date(l.log_date);
            const matched = userForms.some((f) => {
              if (f.form_type !== "incident_report" || f.client_id !== l.client_id) return false;
              const fd = new Date(f.occurred_at);
              return Math.abs(fd.getTime() - logDate.getTime()) <= 1000 * 60 * 60 * 72;
            });
            const gKey = `incident_form:${l.id}`;
            if (matched || overrideSet.has(`${p.id}|${gKey}`)) {
              triggerOk++;
            } else {
              critical = true;
              gaps.push({
                key: gKey,
                type: "incident_form",
                refDate: l.log_date,
                label: `Missing Triggered Form: Incident Report`,
                detail: `Required for ${clientName.get(l.client_id ?? "") || "client"} — ${new Date(l.log_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}. Daily log mentions emergency keyword.`,
              });
            }
          }
        });
        const triggeredPct = triggerTotal === 0 ? 100 : Math.round((triggerOk / triggerTotal) * 100);

        // Logs vs shifts (simple ratio capped to 100; if no shifts → 100)
        const logsPct = notesTotal === 0 ? 100 : Math.min(100, Math.round((userLogs.length / Math.max(1, Math.ceil(notesTotal / 2))) * 100));
        // Use logsPct as proxy for eMAR (med pass) documentation — kept simple in demo
        const medPct = userLogs.length === 0 && notesTotal === 0 ? 100 : logsPct;

        // Training
        const trainingPct = Math.min(100, Math.round((userTraining / tot) * 100));
        if (userTraining < tot) {
          const gKey = `training:incomplete`;
          if (!overrideSet.has(`${p.id}|${gKey}`)) {
            gaps.push({
              key: gKey,
              type: "training",
              refDate: new Date().toISOString().slice(0, 10),
              label: `Mandatory Training Incomplete`,
              detail: `${userTraining} of ${tot} required modules complete.`,
            });
          }
        }

        const overall = Math.round((notesPct + medPct + triggeredPct + trainingPct) / 4);

        return {
          id: p.id,
          name: p.full_name || p.email || "—",
          shiftsCount: userShifts.length,
          notesPct,
          logsPct: medPct,
          triggeredPct,
          trainingPct,
          overall,
          gaps,
          hasCriticalIncident: critical,
        };
      }).sort((a, b) => a.overall - b.overall);

      return { rows, totalModules: tot };
    },
  });

  const nudgeMut = useMutation({
    mutationFn: async (args: { staff: StaffRow; gap: Gap }) => {
      const { error } = await supabase.from("staff_nudges").insert({
        organization_id: org!.organization_id,
        staff_id: args.staff.id,
        gap_type: args.gap.type,
        gap_reference_date: args.gap.refDate,
        gap_key: args.gap.key,
        message: `Action Required: Admin is requesting immediate completion of your missing ${args.gap.label.replace("Missing ", "")} for ${args.gap.refDate}.`,
        priority: "urgent",
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Urgent nudge dispatched 📲"),
    onError: (e: Error) => toast.error(e.message),
  });

  const overrideMut = useMutation({
    mutationFn: async (args: { staff: StaffRow; gap: Gap; reason: string }) => {
      const { error } = await supabase.from("compliance_overrides").insert({
        organization_id: org!.organization_id,
        staff_id: args.staff.id,
        gap_type: args.gap.type,
        gap_reference_date: args.gap.refDate,
        gap_key: args.gap.key,
        reason: args.reason,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Gap resolved via admin override ⚙️");
      qc.invalidateQueries({ queryKey: ["compliance-matrix"] });
      setDrawerStaff((prev) => prev ? { ...prev } : prev);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Refresh drawer staff with latest data after override
  const refreshedStaff = useMemo(() => {
    if (!drawerStaff || !data) return drawerStaff;
    return data.rows.find((r) => r.id === drawerStaff.id) ?? drawerStaff;
  }, [drawerStaff, data]);

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <span className="text-base">🚨</span> Live Agency Operational Compliance Matrix
          </h3>
          <p className="text-xs text-muted-foreground">
            Real-time documentation, eMAR, triggered forms, and training scoring for {label.toLowerCase()}.
          </p>
        </div>
        <Select value={range} onValueChange={(v) => setRange(v as Range)}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="week">View This Week</SelectItem>
            <SelectItem value="month">View This Month</SelectItem>
            <SelectItem value="90d">View Past 90 Days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Staff</th>
              <th className="py-2 px-2 font-medium"><FileText className="inline h-3 w-3" /> Notes</th>
              <th className="py-2 px-2 font-medium"><Stethoscope className="inline h-3 w-3" /> eMAR</th>
              <th className="py-2 px-2 font-medium"><AlertTriangle className="inline h-3 w-3" /> Triggers</th>
              <th className="py-2 px-2 font-medium"><GraduationCap className="inline h-3 w-3" /> Training</th>
              <th className="py-2 px-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading matrix…</td></tr>
            )}
            {!isLoading && !data?.rows.length && (
              <tr><td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No staff data yet.</td></tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-0 align-top">
                <td className="py-3 pr-3">
                  <div className="flex items-center gap-2">
                    <OverallBadge pct={r.overall} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{r.name}</p>
                      <p className="text-[10px] text-muted-foreground">{r.shiftsCount} shift{r.shiftsCount === 1 ? "" : "s"} in range</p>
                    </div>
                  </div>
                  {r.hasCriticalIncident && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-700 dark:text-red-300">
                      <AlertTriangle className="h-3 w-3" /> Awaiting Incident Report Form
                    </div>
                  )}
                </td>
                <td className="py-3 px-2"><MetricCell pct={r.notesPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.logsPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.triggeredPct} /></td>
                <td className="py-3 px-2"><MetricCell pct={r.trainingPct} /></td>
                <td className="py-3 px-2 text-right">
                  {r.overall < 100 ? (
                    <Button size="sm" variant="outline" className="h-8 gap-1 text-xs"
                      onClick={() => setDrawerStaff(r)}>
                      <Zap className="h-3.5 w-3.5 text-amber-500" /> Reconcile Gaps
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck className="h-3 w-3" /> Clean
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawerStaff} onOpenChange={(o) => { if (!o) setDrawerStaff(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" /> Fix Compliance Gaps: {refreshedStaff?.name}
            </SheetTitle>
            <SheetDescription>
              {refreshedStaff?.gaps.length ?? 0} outstanding item{(refreshedStaff?.gaps.length ?? 0) === 1 ? "" : "s"} in {label.toLowerCase()}.
              Send a nudge or override with an administrative reason.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-5 space-y-3">
            {!refreshedStaff?.gaps.length && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                ✅ All gaps resolved. Score restored to 100%.
              </div>
            )}
            {refreshedStaff?.gaps
              .slice()
              .sort((a, b) => a.refDate.localeCompare(b.refDate))
              .map((g) => (
                <GapItem
                  key={g.key}
                  gap={g}
                  onNudge={() => nudgeMut.mutate({ staff: refreshedStaff, gap: g })}
                  onOverride={(reason) => overrideMut.mutate({ staff: refreshedStaff, gap: g, reason })}
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
  const tone = pct >= 95 ? "emerald" : pct >= 70 ? "amber" : "red";
  const dot = tone === "emerald" ? "🟢" : tone === "amber" ? "🟡" : "🔴";
  const cls = tone === "emerald"
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : tone === "amber"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  return (
    <Badge variant="outline" className={`shrink-0 font-mono text-[11px] ${cls}`}>
      {dot} {pct}%
    </Badge>
  );
}

function MetricCell({ pct }: { pct: number }) {
  const tone = pct >= 95 ? "emerald" : pct >= 70 ? "amber" : "red";
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
  gap, onNudge, onOverride, isNudging, isOverriding,
}: {
  gap: Gap;
  onNudge: () => void;
  onOverride: (reason: string) => void;
  isNudging: boolean;
  isOverriding: boolean;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-sm font-medium">❌ {gap.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{gap.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={onNudge} disabled={isNudging}>
          <BellRing className="h-3.5 w-3.5 text-blue-500" /> Send Urgent Nudge
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => setShowOverride((s) => !s)}>
          ⚙️ Override / Resolve Manually
        </Button>
      </div>
      {showOverride && (
        <div className="mt-3 space-y-2">
          <Textarea
            placeholder="Administrative waiver reason (e.g. 'Staff was hospitalized; phone-log verified verbally by manager')"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="min-h-[72px] text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowOverride(false); setReason(""); }}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" disabled={!reason.trim() || isOverriding}
              onClick={() => { onOverride(reason.trim()); setShowOverride(false); setReason(""); }}>
              Confirm Override
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
