import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Send,
  Trash2,
  AlertTriangle,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

type ServiceCode = {
  code: string;
  name: string | null;
  scheduling_behavior:
    | "staffed_residential"
    | "host_family_residential"
    | "supported_living"
    | "day_employment"
    | "respite"
    | "in_home"
    | "behavior"
    | "billing_only";
  requires_schedule: boolean;
  is_living_arrangement: boolean;
  unit: "day" | "quarter_hour" | "session" | "monthly" | "one_time";
};

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  authorized_dspd_codes: string[] | null;
  job_code: string[] | null;
};
type ClientCode = {
  client_id: string;
  service_code: string;
  annual_unit_authorization: number;
  weekly_cap_units: number | null;
};
type Staff = { id: string; full_name: string | null; email: string | null };
type Shift = {
  id: string;
  staff_id: string;
  client_id: string;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  published: boolean;
  is_recurring: boolean;
  recurrence_rule: string | null;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CODE_COLOR: Record<string, string> = {
  HHS: "bg-violet-500",
  PPS: "bg-fuchsia-500",
  SLH: "bg-teal-500",
  SLN: "bg-cyan-500",
  CHA: "bg-amber-500",
  COM: "bg-orange-500",
  HSQ: "bg-rose-500",
  DSI: "bg-blue-500",
  SEI: "bg-indigo-500",
  DSG: "bg-sky-500",
  RP2: "bg-lime-500",
  RP3: "bg-emerald-500",
  RP4: "bg-green-500",
  RP5: "bg-green-600",
  ELS: "bg-yellow-500",
  BC1: "bg-pink-500",
  BC2: "bg-pink-600",
  BC3: "bg-pink-700",
};
const codeColor = (c: string) => CODE_COLOR[c] ?? "bg-slate-500";

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtRange(s: string, e: string) {
  const f = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${f(s)} – ${f(e)}`;
}
function hoursBetween(s: string, e: string) {
  return (new Date(e).getTime() - new Date(s).getTime()) / 3_600_000;
}

export function IndividualServicesScheduler() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);

  const dataQ = useQuery({
    enabled: !!orgId,
    queryKey: ["indiv-sched", orgId, isoDate(weekStart)],
    queryFn: async () => {
      const fromISO = weekStart.toISOString();
      const toISO = weekEnd.toISOString();
      const [catalogR, clientsR, cbcR, memsR, shiftsR, histR] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("service_codes")
          .select("code,name,scheduling_behavior,requires_schedule,is_living_arrangement,unit")
          .eq("organization_id", orgId!),
        supabase
          .from("clients")
          .select("id,first_name,last_name,authorized_dspd_codes,job_code")
          .eq("organization_id", orgId!)
          .order("last_name"),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("client_billing_codes")
          .select("client_id,service_code,annual_unit_authorization,weekly_cap_units")
          .eq("organization_id", orgId!),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("organization_members")
          .select("user_id")
          .eq("organization_id", orgId!)
          .eq("active", true),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("scheduled_shifts")
          .select(
            "id,staff_id,client_id,job_code,starts_at,ends_at,status,published,is_recurring,recurrence_rule",
          )
          .eq("organization_id", orgId!)
          .gte("starts_at", fromISO)
          .lt("starts_at", toISO),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from("scheduled_shifts")
          .select("client_id,staff_id,starts_at")
          .eq("organization_id", orgId!)
          .gte("starts_at", new Date(Date.now() - 90 * 86400_000).toISOString()),
      ]);
      const memberIds = ((memsR.data ?? []) as { user_id: string }[]).map((m) => m.user_id);
      let staff: Staff[] = [];
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name,email")
          .in("id", memberIds);
        staff = (profs ?? []) as Staff[];
      }
      return {
        catalog: (catalogR.data ?? []) as ServiceCode[],
        clients: (clientsR.data ?? []) as Client[],
        cbc: (cbcR.data ?? []) as ClientCode[],
        staff,
        shifts: (shiftsR.data ?? []) as Shift[],
        history: (histR.data ?? []) as { client_id: string; staff_id: string; starts_at: string }[],
      };
    },
  });

  const data = dataQ.data;

  // Catalog lookup
  const catalogByCode = useMemo(() => {
    const m = new Map<string, ServiceCode>();
    (data?.catalog ?? []).forEach((c) => m.set(c.code, c));
    return m;
  }, [data?.catalog]);

  // Real assigned codes per client come from the clients row (the same
  // authorized_dspd_codes / job_code arrays surfaced on the client profile
  // and Clients directory), NOT from client_billing_codes (which only holds
  // optional authorization caps).
  const assignedCodesByClient = useMemo(() => {
    const m = new Map<string, string[]>();
    (data?.clients ?? []).forEach((c) => {
      const set = new Set<string>([
        ...((c.authorized_dspd_codes ?? []) as string[]),
        ...((c.job_code ?? []) as string[]),
      ]);
      m.set(c.id, Array.from(set));
    });
    return m;
  }, [data?.clients]);

  // A client belongs to Individual services when:
  //  - none of their assigned codes is a staffed-residential (RHS) code, AND
  //  - at least one assigned code is schedulable (requires_schedule=true)
  //    and is NOT staffed_residential — i.e. SLH/SLN/DSI/SEI/CHA/COM/HSQ/
  //    RP2–RP5/ELS/DSG, etc.
  // Pure host-home/PPS clients (HHS/PPS only — schedule ✘ in the catalog)
  // therefore do NOT appear here; host-home living is never scheduled.
  const indivClients = useMemo(() => {
    if (!data) return [];
    return data.clients.filter((c) => {
      const codes = assignedCodesByClient.get(c.id) ?? [];
      const hasRHS = codes.some(
        (code) => catalogByCode.get(code)?.scheduling_behavior === "staffed_residential",
      );
      if (hasRHS) return false;
      return codes.some((code) => {
        const sc = catalogByCode.get(code);
        return (
          !!sc?.requires_schedule && sc.scheduling_behavior !== "staffed_residential"
        );
      });
    });
  }, [data, catalogByCode, assignedCodesByClient]);

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selected =
    indivClients.find((c) => c.id === selectedClientId) ?? indivClients[0] ?? null;

  const selectedAssigned = useMemo(
    () => (selected ? assignedCodesByClient.get(selected.id) ?? [] : []),
    [selected, assignedCodesByClient],
  );

  const selectedCbc = useMemo(() => {
    if (!selected || !data) return [];
    return data.cbc.filter((b) => b.client_id === selected.id);
  }, [selected, data]);

  // Schedulable codes for the selected client = catalog-schedulable ∩ assigned,
  // excluding staffed_residential (which lives on the Residential board).
  const schedulableCodes = useMemo(() => {
    return selectedAssigned.filter((code) => {
      const sc = catalogByCode.get(code);
      return !!sc?.requires_schedule && sc.scheduling_behavior !== "staffed_residential";
    });
  }, [selectedAssigned, catalogByCode]);

  const livingArrangement = useMemo(() => {
    return (
      selectedAssigned.find((c) => catalogByCode.get(c)?.is_living_arrangement) ?? null
    );
  }, [selectedAssigned, catalogByCode]);


  const clientShifts = useMemo(() => {
    if (!selected || !data) return [];
    return data.shifts.filter((s) => s.client_id === selected.id);
  }, [selected, data]);

  // Per-staff overlap detection in the visible week (across all clients).
  const staffWeekShifts = useMemo(() => {
    const m = new Map<string, Shift[]>();
    (data?.shifts ?? []).forEach((s) => {
      if (!m.has(s.staff_id)) m.set(s.staff_id, []);
      m.get(s.staff_id)!.push(s);
    });
    return m;
  }, [data?.shifts]);
  function hasConflict(shift: Shift) {
    const list = staffWeekShifts.get(shift.staff_id) ?? [];
    return list.some(
      (o) =>
        o.id !== shift.id &&
        new Date(o.starts_at) < new Date(shift.ends_at) &&
        new Date(o.ends_at) > new Date(shift.starts_at),
    );
  }

  // Continuity score: regular = most recent staff for this client.
  const regularStaffByCode = useMemo(() => {
    const map = new Map<string, string>();
    if (!selected || !data) return map;
    schedulableCodes.forEach((code) => {
      const counts = new Map<string, number>();
      data.history
        .filter((h) => h.client_id === selected.id)
        .forEach((h) => counts.set(h.staff_id, (counts.get(h.staff_id) ?? 0) + 1));
      let top: string | null = null;
      let best = 0;
      counts.forEach((v, k) => {
        if (v > best) {
          best = v;
          top = k;
        }
      });
      if (top) map.set(code, top);
    });
    return map;
  }, [selected, data, schedulableCodes]);

  // Burn-down iterates the client's actual schedulable assignments. Authorization
  // caps come from client_billing_codes when present; otherwise targets are 0
  // (advisory — "no auth on file" shows but never blocks scheduling).
  const burndown = useMemo(() => {
    if (!selected || !data) return [] as Array<{
      code: string;
      unit: string;
      scheduledHours: number;
      targetHours: number;
      scheduledUnits: number;
      targetUnits: number;
    }>;
    return schedulableCodes.map((code) => {
      const sc = catalogByCode.get(code);
      const isQuarter = sc?.unit === "quarter_hour";
      const cbc = selectedCbc.find((b) => b.service_code === code);
      const targetUnits = cbc
        ? cbc.weekly_cap_units ?? Math.round((cbc.annual_unit_authorization ?? 0) / 52)
        : 0;
      const targetHours = isQuarter ? targetUnits / 4 : targetUnits;
      const scheduledHours = clientShifts
        .filter((s) => s.job_code === code)
        .reduce((sum, s) => sum + hoursBetween(s.starts_at, s.ends_at), 0);
      const scheduledUnits = isQuarter
        ? Math.round(scheduledHours * 4)
        : Math.round(scheduledHours);
      return {
        code,
        unit: sc?.unit ?? "quarter_hour",
        scheduledHours,
        targetHours,
        scheduledUnits,
        targetUnits,
      };
    });
  }, [selected, data, schedulableCodes, selectedCbc, clientShifts, catalogByCode]);


  // NECTAR overall suggestion: largest gap.
  const nectarSuggest = useMemo(() => {
    const gaps = burndown
      .map((b) => ({ code: b.code, gap: b.targetHours - b.scheduledHours }))
      .filter((g) => g.gap > 0.25)
      .sort((a, b) => b.gap - a.gap);
    return gaps[0] ?? null;
  }, [burndown]);

  // Schedule dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDay, setDialogDay] = useState<Date | null>(null);

  function openDialog(day: Date) {
    setDialogDay(day);
    setDialogOpen(true);
  }

  async function publishShift(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("scheduled_shifts")
      .update({ published: true })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Published — staff will see it on their schedule.");
    qc.invalidateQueries({ queryKey: ["indiv-sched", orgId] });
  }
  async function deleteShift(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("scheduled_shifts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Removed");
    qc.invalidateQueries({ queryKey: ["indiv-sched", orgId] });
  }

  if (dataQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading individual services…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Individual services</h2>
          <p className="text-xs text-muted-foreground">
            Host home (HHS/PPS) and supported living (SLH/SLN) clients. Schedule per-person
            service blocks; RHS group-home coverage is on the Residential board.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-xs font-medium tabular-nums">
            {weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {" – "}
            {addDays(weekEnd, -1).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
          >
            Today
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Client roster */}
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-medium uppercase text-muted-foreground">
            Clients ({indivClients.length})
          </p>
          {indivClients.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
              No host-home or supported-living clients found. Assign HHS/PPS/SLH/SLN to a
              client to see them here.
            </div>
          )}
          {indivClients.map((c) => {
            const cbcCodes = (data?.cbc ?? [])
              .filter((b) => b.client_id === c.id)
              .map((b) => b.service_code)
              .filter((code) => catalogByCode.get(code)?.requires_schedule);
            const blockCount = (data?.shifts ?? []).filter((s) => s.client_id === c.id).length;
            const living =
              cbcCodes.find((code) => catalogByCode.get(code)?.is_living_arrangement) ?? null;
            const active = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedClientId(c.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-[#137182] bg-[#137182]/5"
                    : "border-border bg-card hover:border-[#137182]/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    {c.first_name} {c.last_name}
                  </p>
                  <Badge variant="outline" className="text-[10px]">
                    {blockCount} this wk
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {living
                    ? `Living: ${living}`
                    : "No living-arrangement code"}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {cbcCodes.map((code) => (
                    <span
                      key={code}
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold text-white ${codeColor(code)}`}
                    >
                      {code}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>

        {/* Main panel */}
        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Select a client from the left to see their weekly agenda.
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-base font-semibold">
                    {selected.first_name} {selected.last_name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Schedulable codes: {schedulableCodes.join(", ") || "—"}
                    {livingArrangement && ` · Living: ${livingArrangement}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500" /> Published
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full border border-dashed border-slate-400" />{" "}
                    Draft
                  </span>
                </div>
              </div>

              {/* NECTAR strip */}
              {nectarSuggest && (
                <div className="flex items-start gap-2 rounded-lg border border-[#137182]/30 bg-[#137182]/5 px-3 py-2 text-xs">
                  <Sparkles className="mt-0.5 h-4 w-4 text-[#137182]" />
                  <p>
                    <span className="font-semibold text-[#137182]">NECTAR:</span> add about{" "}
                    {nectarSuggest.gap.toFixed(1)} more hours of {nectarSuggest.code} this week
                    to hit authorization.
                    {regularStaffByCode.get(nectarSuggest.code) && (
                      <>
                        {" "}Continuity pick:{" "}
                        <span className="font-medium">
                          {data?.staff.find(
                            (s) => s.id === regularStaffByCode.get(nectarSuggest.code),
                          )?.full_name ??
                            data?.staff.find(
                              (s) => s.id === regularStaffByCode.get(nectarSuggest.code),
                            )?.email ??
                            "regular"}
                        </span>
                        .
                      </>
                    )}{" "}
                    Admin decides — advisory only.
                  </p>
                </div>
              )}

              {/* Weekly agenda */}
              <div className="overflow-x-auto rounded-lg border border-border bg-card">
                <div className="grid min-w-[760px] grid-cols-7">
                  {DAYS.map((label, i) => {
                    const day = addDays(weekStart, i);
                    const dayShifts = clientShifts
                      .filter((s) => isoDate(new Date(s.starts_at)) === isoDate(day))
                      .sort(
                        (a, b) =>
                          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
                      );
                    return (
                      <div
                        key={i}
                        className="flex min-h-[180px] flex-col border-r border-border last:border-r-0"
                      >
                        <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2 py-1.5">
                          <div>
                            <p className="text-[10px] font-medium uppercase text-muted-foreground">
                              {label}
                            </p>
                            <p className="text-sm font-semibold tabular-nums">
                              {day.getDate()}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openDialog(day)}
                            aria-label={`Add service on ${label}`}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="flex-1 space-y-1 p-1.5">
                          {dayShifts.map((s) => {
                            const staffName =
                              data?.staff.find((st) => st.id === s.staff_id)?.full_name ??
                              data?.staff.find((st) => st.id === s.staff_id)?.email ??
                              "—";
                            const conflict = hasConflict(s);
                            return (
                              <div
                                key={s.id}
                                className={`group relative rounded p-1.5 text-[10px] text-white ${codeColor(
                                  s.job_code ?? "",
                                )} ${s.published ? "" : "opacity-70 ring-1 ring-dashed ring-white/70"}`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono font-semibold">{s.job_code}</span>
                                  {!s.published && (
                                    <span className="rounded bg-white/25 px-1 text-[9px]">
                                      Draft
                                    </span>
                                  )}
                                </div>
                                <p className="leading-tight">{fmtRange(s.starts_at, s.ends_at)}</p>
                                <p className="truncate leading-tight opacity-90">{staffName}</p>
                                {conflict && (
                                  <p className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-white/30 px-1 text-[9px]">
                                    <AlertTriangle className="h-2.5 w-2.5" /> double-booked
                                  </p>
                                )}
                                <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                                  {!s.published && (
                                    <button
                                      type="button"
                                      onClick={() => publishShift(s.id)}
                                      className="rounded bg-white/30 p-0.5 hover:bg-white/50"
                                      title="Publish"
                                    >
                                      <Send className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => deleteShift(s.id)}
                                    className="rounded bg-white/30 p-0.5 hover:bg-white/50"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {dayShifts.length === 0 && (
                            <p className="px-1 pt-1 text-[10px] text-muted-foreground/60">—</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Burn-down */}
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="mb-2 flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Authorization burn-down · this week</p>
                </div>
                {burndown.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No schedulable authorizations on file for this client.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {burndown.map((b) => {
                      const pct =
                        b.targetHours > 0
                          ? Math.min(100, (b.scheduledHours / b.targetHours) * 100)
                          : 0;
                      const onPace = b.scheduledHours >= b.targetHours * 0.9;
                      const isQuarter = b.unit === "quarter_hour";
                      return (
                        <div key={b.code}>
                          <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                            <span className="font-mono font-semibold">{b.code}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {b.scheduledHours.toFixed(1)}h
                              {isQuarter && ` (${b.scheduledUnits}u)`} of {b.targetHours.toFixed(1)}h
                              {isQuarter && ` (${b.targetUnits}u)`} authorized
                              <Badge
                                variant="secondary"
                                className={`ml-2 text-[10px] ${
                                  onPace
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                }`}
                              >
                                {onPace ? "On pace" : "Behind"}
                              </Badge>
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${codeColor(b.code)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {dialogOpen && selected && data && orgId && user && (
        <ScheduleServiceDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          orgId={orgId}
          userId={user.id}
          client={selected}
          day={dialogDay ?? new Date()}
          schedulableCodes={schedulableCodes}
          catalogByCode={catalogByCode}
          staff={data.staff}
          regularStaffByCode={regularStaffByCode}
          burndown={burndown}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["indiv-sched", orgId] });
          }}
        />
      )}
    </div>
  );
}

function ScheduleServiceDialog({
  open,
  onClose,
  orgId,
  userId,
  client,
  day,
  schedulableCodes,
  catalogByCode,
  staff,
  regularStaffByCode,
  burndown,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  userId: string;
  client: Client;
  day: Date;
  schedulableCodes: string[];
  catalogByCode: Map<string, ServiceCode>;
  staff: Staff[];
  regularStaffByCode: Map<string, string>;
  burndown: Array<{
    code: string;
    unit: string;
    scheduledHours: number;
    targetHours: number;
  }>;
  onSaved: () => void;
}) {
  const [code, setCode] = useState<string>(schedulableCodes[0] ?? "");
  const [staffId, setStaffId] = useState<string>(
    regularStaffByCode.get(schedulableCodes[0] ?? "") ?? "",
  );
  const [date, setDate] = useState<string>(isoDate(day));
  const [start, setStart] = useState<string>("09:00");
  const [end, setEnd] = useState<string>("12:00");
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("none");
  const [busy, setBusy] = useState(false);

  const startISO = new Date(`${date}T${start}:00`).toISOString();
  const endISO = new Date(`${date}T${end}:00`).toISOString();
  const hours = Math.max(0, hoursBetween(startISO, endISO));
  const sc = catalogByCode.get(code);
  const isQuarter = sc?.unit === "quarter_hour";
  const units = isQuarter ? Math.round(hours * 4) : Math.round(hours);
  const codeBurn = burndown.find((b) => b.code === code);
  const projected = (codeBurn?.scheduledHours ?? 0) + hours;
  const target = codeBurn?.targetHours ?? 0;

  async function save(publish: boolean) {
    if (!code) return toast.error("Pick a service code.");
    if (!staffId) return toast.error("Pick a staffer.");
    if (hours <= 0) return toast.error("End must be after start.");
    setBusy(true);
    const payload = {
      organization_id: orgId,
      staff_id: staffId,
      client_id: client.id,
      job_code: code,
      shift_type: "hourly",
      starts_at: startISO,
      ends_at: endISO,
      status: "pending",
      published: publish,
      is_recurring: recurrence === "weekly",
      recurrence_rule: recurrence === "weekly" ? "weekly" : null,
      recurrence_end_date: null,
      created_by: userId,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("scheduled_shifts").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(publish ? "Scheduled and published." : "Draft saved.");
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Schedule a service · {client.first_name} {client.last_name}
          </DialogTitle>
          <DialogDescription>
            Reuses the same publish + EVV/clock-in mechanism as residential. Drafts stay
            hidden from staff until published.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Service</Label>
              <Select
                value={code}
                onValueChange={(v) => {
                  setCode(v);
                  const r = regularStaffByCode.get(v);
                  if (r) setStaffId(r);
                }}
              >
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Code" />
                </SelectTrigger>
                <SelectContent>
                  {schedulableCodes.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c} — {catalogByCode.get(c)?.name ?? ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Staff</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder="Pick staffer" />
                </SelectTrigger>
                <SelectContent>
                  {staff.map((s) => {
                    const isReg = regularStaffByCode.get(code) === s.id;
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {(s.full_name ?? s.email ?? "—") + (isReg ? "  ★ regular" : "")}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label>Start</Label>
              <Input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 h-9"
              />
            </div>
          </div>
          <div>
            <Label>Recurrence</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as "none" | "weekly")}>
              <SelectTrigger className="mt-1 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">This week only</SelectItem>
                <SelectItem value="weekly">Every week</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="font-semibold">Live math</p>
            <p className="mt-1">
              {hours.toFixed(2)} hours
              {isQuarter && ` · ${units} quarter-hour units`}
            </p>
            {codeBurn && target > 0 && (
              <p className="mt-1 text-muted-foreground">
                Takes {code} to {projected.toFixed(1)}h of {target.toFixed(1)}h authorized this
                week.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>
            Save as draft
          </Button>
          <Button onClick={() => save(true)} disabled={busy}>
            <Send className="h-4 w-4" /> Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
