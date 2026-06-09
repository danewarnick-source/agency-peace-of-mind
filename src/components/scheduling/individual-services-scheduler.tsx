import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Wand2,
  Pencil,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseScheduleSentence,
  type NectarScheduleResult,
  type NectarSchedulePlan,
} from "@/lib/nectar-schedule-parse.functions";


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
  const [nectarOpen, setNectarOpen] = useState(false);
  const [editShift, setEditShift] = useState<Shift | null>(null);

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
            Clients who receive scheduled individual services — supported living
            (SLH/SLN) plus day/employment and in-home add-ons. RHS group-home coverage
            is on the Residential board.
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
              No clients with schedulable individual services found. Assign a
              schedulable code (e.g. SLH, SLN, DSI, SEI, CHA, COM, HSQ) to a non-RHS
              client to see them here. Host-home (HHS/PPS) living itself is never
              scheduled or clocked in.
            </div>
          )}
          {indivClients.map((c) => {
            const assigned = assignedCodesByClient.get(c.id) ?? [];
            const cbcCodes = assigned.filter(
              (code) => catalogByCode.get(code)?.requires_schedule,
            );
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
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNectarOpen(true)}
                    className="h-8 gap-1.5 border-[#137182]/40 text-[#137182] hover:bg-[#137182]/5"
                    disabled={schedulableCodes.length === 0}
                  >
                    <Wand2 className="h-3.5 w-3.5" /> Ask NECTAR to schedule
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openDialog(addDays(weekStart, new Date().getDay()))}
                    className="h-8 gap-1.5"
                    disabled={schedulableCodes.length === 0}
                  >
                    <Plus className="h-3.5 w-3.5" /> Schedule a service
                  </Button>
                  <span className="inline-flex items-center gap-1 pl-2">
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
                                role="button"
                                tabIndex={0}
                                onClick={() => setEditShift(s)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setEditShift(s);
                                  }
                                }}
                                className={`group relative cursor-pointer rounded p-1.5 text-[10px] text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-white/70 ${codeColor(
                                  s.job_code ?? "",
                                )} ${s.published ? "" : "opacity-70 ring-1 ring-dashed ring-white/70"}`}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono font-semibold">{s.job_code}</span>
                                  <div className="flex items-center gap-1">
                                    {s.is_recurring && (
                                      <span title="Recurring weekly" className="rounded bg-white/25 px-1 text-[9px]">↻</span>
                                    )}
                                    {!s.published && (
                                      <span className="rounded bg-white/25 px-1 text-[9px]">Draft</span>
                                    )}
                                  </div>
                                </div>
                                <p className="leading-tight">{fmtRange(s.starts_at, s.ends_at)}</p>
                                <p className="truncate leading-tight opacity-90">{staffName}</p>
                                {conflict && (
                                  <p className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-white/30 px-1 text-[9px]">
                                    <AlertTriangle className="h-2.5 w-2.5" /> double-booked
                                  </p>
                                )}
                                <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setEditShift(s); }}
                                    className="rounded bg-white/30 p-0.5 hover:bg-white/50"
                                    title="Edit"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  {!s.published && (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); publishShift(s.id); }}
                                      className="rounded bg-white/30 p-0.5 hover:bg-white/50"
                                      title="Publish"
                                    >
                                      <Send className="h-3 w-3" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); deleteShift(s.id); }}
                                    className="rounded bg-white/30 p-0.5 hover:bg-white/50"
                                    title="Delete (this occurrence)"
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
                    No schedulable services assigned to this client yet.
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
          weekStart={weekStart}
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

      {nectarOpen && selected && data && orgId && user && (
        <NectarScheduleDialog
          open={nectarOpen}
          onClose={() => setNectarOpen(false)}
          orgId={orgId}
          userId={user.id}
          client={selected}
          weekStart={weekStart}
          schedulableCodes={schedulableCodes}
          staff={data.staff}
          onSaved={() => qc.invalidateQueries({ queryKey: ["indiv-sched", orgId] })}
        />
      )}

      {editShift && data && orgId && (
        <EditShiftDialog
          shift={editShift}
          onClose={() => setEditShift(null)}
          orgId={orgId}
          staff={data.staff}
          schedulableCodes={
            schedulableCodes.includes(editShift.job_code ?? "")
              ? schedulableCodes
              : [editShift.job_code ?? "", ...schedulableCodes].filter(Boolean)
          }
          catalogByCode={catalogByCode}
          onSaved={() => qc.invalidateQueries({ queryKey: ["indiv-sched", orgId] })}
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
  weekStart,
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
  weekStart: Date;
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
  const [days, setDays] = useState<number[]>([day.getDay()]);
  const [start, setStart] = useState<string>("09:00");
  const [end, setEnd] = useState<string>("12:00");
  const [recurrence, setRecurrence] = useState<"none" | "weekly">("none");
  const [busy, setBusy] = useState(false);

  const sc = catalogByCode.get(code);
  const isQuarter = sc?.unit === "quarter_hour";
  const perDayHours = Math.max(
    0,
    (new Date(`2000-01-01T${end}:00`).getTime() - new Date(`2000-01-01T${start}:00`).getTime()) / 3_600_000,
  );
  const totalHours = perDayHours * days.length;
  const units = isQuarter ? Math.round(totalHours * 4) : Math.round(totalHours);
  const codeBurn = burndown.find((b) => b.code === code);
  const projected = (codeBurn?.scheduledHours ?? 0) + totalHours;
  const target = codeBurn?.targetHours ?? 0;

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function save(publish: boolean) {
    if (!code) return toast.error("Pick a service code.");
    if (!staffId) return toast.error("Pick a staffer.");
    if (perDayHours <= 0) return toast.error("End must be after start.");
    if (days.length === 0) return toast.error("Pick at least one day.");
    setBusy(true);
    const isRecurring = recurrence === "weekly";
    const payload = days.map((d) => {
      const dt = addDays(weekStart, d);
      const dateStr = isoDate(dt);
      return {
        organization_id: orgId,
        staff_id: staffId,
        client_id: client.id,
        job_code: code,
        shift_type: "hourly",
        starts_at: new Date(`${dateStr}T${start}:00`).toISOString(),
        ends_at: new Date(`${dateStr}T${end}:00`).toISOString(),
        status: "pending",
        published: publish,
        is_recurring: isRecurring,
        recurrence_rule: isRecurring ? "weekly" : null,
        recurrence_end_date: null,
        created_by: userId,
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("scheduled_shifts").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      publish
        ? `Scheduled & published ${payload.length} block${payload.length === 1 ? "" : "s"}.`
        : `Saved ${payload.length} draft block${payload.length === 1 ? "" : "s"}.`,
    );
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
            Pick one or more days, a time window, and recurrence. Drafts stay
            hidden from staff until you publish.
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
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Code" /></SelectTrigger>
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
                <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Pick staffer" /></SelectTrigger>
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

          <div>
            <Label>Days</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DAYS.map((label, i) => {
                const active = days.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`min-h-[36px] min-w-[44px] rounded-md border px-2.5 text-xs font-semibold transition ${
                      active
                        ? "border-[#137182] bg-[#137182] text-white"
                        : "border-border bg-background text-foreground hover:border-[#137182]/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {days.length} day{days.length === 1 ? "" : "s"} selected this week ·{" "}
              {days.map((d) => DAYS[d]).join(" / ") || "—"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>

          <div>
            <Label>Recurrence</Label>
            <Select value={recurrence} onValueChange={(v) => setRecurrence(v as "none" | "weekly")}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">This week only</SelectItem>
                <SelectItem value="weekly">Every week (same days, same time)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            <p className="font-semibold">Live math</p>
            <p className="mt-1">
              {perDayHours.toFixed(2)} hrs × {days.length} day{days.length === 1 ? "" : "s"} ={" "}
              {totalHours.toFixed(2)} hrs
              {isQuarter && ` · ${units} quarter-hour units`}
            </p>
            {codeBurn && target > 0 && (
              <p className="mt-1 text-muted-foreground">
                Takes {code} to {projected.toFixed(1)}h of {target.toFixed(1)}h authorized this week.
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save as draft</Button>
          <Button onClick={() => save(true)} disabled={busy}>
            <Send className="h-4 w-4" /> Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- NECTAR natural-language scheduler -----------------

function NectarScheduleDialog({
  open,
  onClose,
  orgId,
  userId,
  client,
  weekStart,
  schedulableCodes,
  staff,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  userId: string;
  client: Client;
  weekStart: Date;
  schedulableCodes: string[];
  staff: Staff[];
  onSaved: () => void;
}) {
  const parseFn = useServerFn(parseScheduleSentence);
  const [sentence, setSentence] = useState(
    `Schedule ${staff[0]?.full_name?.split(" ")[0] ?? "a staffer"} with ${client.first_name} every Mon, Wed, Fri 10:00a–3:00p.`,
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<NectarScheduleResult | null>(null);
  const [saving, setSaving] = useState(false);

  async function ask() {
    if (!sentence.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await parseFn({
        data: {
          sentence: sentence.trim(),
          clients: [
            {
              id: client.id,
              name: `${client.first_name} ${client.last_name}`.trim(),
              schedulable_codes: schedulableCodes,
            },
          ],
          staff: staff.map((s) => ({
            id: s.id,
            name: s.full_name ?? s.email ?? "—",
          })),
        },
      });
      setResult(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "NECTAR couldn't reach the gateway.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(plan: NectarSchedulePlan) {
    setSaving(true);
    const payload = plan.days.map((d) => {
      const dt = addDays(weekStart, d);
      const dateStr = isoDate(dt);
      return {
        organization_id: orgId,
        staff_id: plan.staff_id,
        client_id: plan.client_id,
        job_code: plan.code,
        shift_type: "hourly",
        starts_at: new Date(`${dateStr}T${plan.start}:00`).toISOString(),
        ends_at: new Date(`${dateStr}T${plan.end}:00`).toISOString(),
        status: "pending",
        published: false, // NECTAR never auto-publishes
        is_recurring: plan.recurrence === "weekly",
        recurrence_rule: plan.recurrence === "weekly" ? "weekly" : null,
        recurrence_end_date: null,
        created_by: userId,
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("scheduled_shifts").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`NECTAR added ${payload.length} draft block${payload.length === 1 ? "" : "s"}. Publish when ready.`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-[#137182]" /> Ask NECTAR to schedule
          </DialogTitle>
          <DialogDescription>
            Describe the shift in plain English. NECTAR proposes draft blocks — nothing
            publishes until you choose to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            rows={3}
            className="text-sm"
            placeholder="e.g. Schedule Dane with Johnny every Mon, Wed, Fri from 10am to 3pm."
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={ask} disabled={busy || !sentence.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {busy ? "Thinking…" : "Parse with NECTAR"}
            </Button>
          </div>

          {result?.kind === "ask" && (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <p className="font-semibold">NECTAR needs one detail:</p>
              <p className="mt-1">{result.question}</p>
              <p className="mt-2 text-[11px] opacity-80">
                Add the missing detail to the sentence and parse again.
              </p>
            </div>
          )}

          {result?.kind === "ok" && (
            <div className="space-y-2 rounded-lg border border-[#137182]/40 bg-[#137182]/5 p-3 text-sm">
              <p className="font-semibold text-[#137182]">Preview — confirm to create as drafts:</p>
              <p className="font-mono text-xs">{result.summary}</p>
              <p className="text-[11px] text-muted-foreground">
                {result.days.length} block{result.days.length === 1 ? "" : "s"} will be added this week
                {result.recurrence === "weekly" ? " and marked as weekly recurring" : ""}.
                Nothing publishes automatically.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" onClick={() => setResult(null)} disabled={saving}>
                  Edit sentence
                </Button>
                <Button size="sm" onClick={() => confirm(result)} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Confirm & save drafts
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy || saving}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Edit / change / delete existing block -----------------

function EditShiftDialog({
  shift,
  onClose,
  orgId,
  staff,
  schedulableCodes,
  catalogByCode,
  onSaved,
}: {
  shift: Shift;
  onClose: () => void;
  orgId: string;
  staff: Staff[];
  schedulableCodes: string[];
  catalogByCode: Map<string, ServiceCode>;
  onSaved: () => void;
}) {
  const initStart = new Date(shift.starts_at);
  const initEnd = new Date(shift.ends_at);
  const toTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const [staffId, setStaffId] = useState(shift.staff_id);
  const [code, setCode] = useState(shift.job_code ?? schedulableCodes[0] ?? "");
  const [start, setStart] = useState(toTime(initStart));
  const [end, setEnd] = useState(toTime(initEnd));
  const [scope, setScope] = useState<"one" | "series">("one");
  const [busy, setBusy] = useState(false);

  const dateStr = isoDate(initStart);
  const newStartISO = new Date(`${dateStr}T${start}:00`).toISOString();
  const newEndISO = new Date(`${dateStr}T${end}:00`).toISOString();
  const dayOfWeek = initStart.getDay();
  const origStartHHMM = toTime(initStart);

  async function fetchSeriesIds(): Promise<string[]> {
    // Series = same client, code, weekly recurring, same DOW & same start time-of-day,
    // starting on or after this occurrence.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("scheduled_shifts")
      .select("id, starts_at")
      .eq("organization_id", orgId)
      .eq("client_id", shift.client_id)
      .eq("job_code", shift.job_code)
      .eq("is_recurring", true)
      .gte("starts_at", shift.starts_at);
    if (error || !data) return [shift.id];
    return (data as Array<{ id: string; starts_at: string }>)
      .filter((r) => {
        const d = new Date(r.starts_at);
        return d.getDay() === dayOfWeek && toTime(d) === origStartHHMM;
      })
      .map((r) => r.id);
  }

  async function save() {
    if (newStartISO >= newEndISO) return toast.error("End must be after start.");
    setBusy(true);
    const ids = scope === "series" && shift.is_recurring ? await fetchSeriesIds() : [shift.id];
    if (scope === "series" && shift.is_recurring) {
      // For the series, we only update staff and code (time-of-day stays consistent
      // across occurrences but each row's calendar date stays put).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("scheduled_shifts")
        .update({ staff_id: staffId, job_code: code })
        .in("id", ids);
      // Apply time change per row so each occurrence keeps its own date.
      if (!error) {
        for (const id of ids) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: row } = await (supabase as any)
            .from("scheduled_shifts").select("starts_at").eq("id", id).single();
          if (!row) continue;
          const d = isoDate(new Date(row.starts_at as string));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("scheduled_shifts").update({
            starts_at: new Date(`${d}T${start}:00`).toISOString(),
            ends_at: new Date(`${d}T${end}:00`).toISOString(),
          }).eq("id", id);
        }
      }
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`Updated ${ids.length} occurrences in this series.`);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("scheduled_shifts")
        .update({
          staff_id: staffId,
          job_code: code,
          starts_at: newStartISO,
          ends_at: newEndISO,
        })
        .eq("id", shift.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Block updated.");
    }
    onSaved();
    onClose();
  }

  async function remove() {
    setBusy(true);
    const ids = scope === "series" && shift.is_recurring ? await fetchSeriesIds() : [shift.id];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("scheduled_shifts").delete().in("id", ids);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(
      ids.length > 1 ? `Deleted ${ids.length} occurrences.` : "Block deleted.",
    );
    onSaved();
    onClose();
  }

  async function quickSwap(newStaffId: string) {
    setStaffId(newStaffId);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit block · {shift.job_code} ·{" "}
            {initStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
          </DialogTitle>
          <DialogDescription>
            Change staff, time window, or service — or delete this block. Drafts stay
            hidden from staff; published changes update their schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {shift.is_recurring && (
            <div className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-xs dark:bg-amber-950/30">
              <p className="mb-1 font-semibold">Recurring block — apply changes to:</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope("one")}
                  className={`min-h-[36px] flex-1 rounded border px-2 text-xs font-semibold ${
                    scope === "one"
                      ? "border-[#137182] bg-[#137182] text-white"
                      : "border-border bg-background"
                  }`}
                >
                  This occurrence only
                </button>
                <button
                  type="button"
                  onClick={() => setScope("series")}
                  className={`min-h-[36px] flex-1 rounded border px-2 text-xs font-semibold ${
                    scope === "series"
                      ? "border-[#137182] bg-[#137182] text-white"
                      : "border-border bg-background"
                  }`}
                >
                  Whole series (this + future)
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Service</Label>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
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
              <Select value={staffId} onValueChange={quickSwap}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {staff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name ?? s.email ?? "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[10px] text-muted-foreground">Quick-swap staff supported.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label>End</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={remove} disabled={busy} className="mr-auto">
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

