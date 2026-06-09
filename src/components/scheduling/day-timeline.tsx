import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Wand2,
  Moon,
} from "lucide-react";
import { toast } from "sonner";

// ---------- helpers ----------
const DAY_MIN = 24 * 60;
function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function fmtTime(min: number) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "p" : "a";
  const hh = ((h + 11) % 12) + 1;
  return mm === 0 ? `${hh}${ampm}` : `${hh}:${String(mm).padStart(2, "0")}${ampm}`;
}
function minutesIntoDay(iso: string, dayStart: Date) {
  const t = new Date(iso).getTime();
  const s = dayStart.getTime();
  return Math.max(0, Math.min(DAY_MIN, Math.round((t - s) / 60000)));
}
function colorForId(id: string) {
  // stable hue per staff id
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

type Team = { id: string; team_name: string; setting: string | null };
type Client = { id: string; first_name: string; last_name: string; team_id: string | null };
type Ratio = { client_id: string; setting: string; ratio_staff: number; ratio_clients: number; effective_start: string; effective_end: string | null };
type Code = { id: string; code: string; label: string | null; kind: string; carve_out: boolean };
type Shift = {
  id: string;
  client_id: string;
  staff_id: string;
  code_id: string | null;
  job_code: string | null;
  starts_at: string;
  ends_at: string;
  published: boolean;
};
type StaffMember = { id: string; full_name: string | null; email: string | null };
type Evv = { staff_id: string; client_id: string; clock_in_timestamp: string; clock_out_timestamp: string | null };

// ---------- segment math ----------
type Seg = { start: number; end: number };
function clip(s: Seg, range: Seg): Seg | null {
  const a = Math.max(s.start, range.start);
  const b = Math.min(s.end, range.end);
  return b > a ? { start: a, end: b } : null;
}
function subtract(base: Seg, holes: Seg[]): Seg[] {
  const sorted = holes
    .map((h) => clip(h, base))
    .filter((x): x is Seg => !!x)
    .sort((a, b) => a.start - b.start);
  const out: Seg[] = [];
  let cur = base.start;
  for (const h of sorted) {
    if (h.start > cur) out.push({ start: cur, end: h.start });
    cur = Math.max(cur, h.end);
  }
  if (cur < base.end) out.push({ start: cur, end: base.end });
  return out;
}
function overlap(a: Seg, b: Seg) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

// ---------- Component ----------
export function DayTimeline() {
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const [date, setDate] = useState(() => isoDate(new Date()));
  const [homeId, setHomeId] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [addClient, setAddClient] = useState<string>("");
  const qc = useQueryClient();

  const orgId = org?.organization_id;
  const dayStart = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const dayEnd = useMemo(() => new Date(`${date}T24:00:00`), [date]);

  const { data: teams = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["day-teams", orgId],
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await (supabase as any)
        .from("teams")
        .select("id, team_name, setting")
        .eq("organization_id", orgId)
        .order("team_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // pick the first home automatically
  const activeHomeId = homeId || teams[0]?.id || "";
  const activeTeam = teams.find((t) => t.id === activeHomeId) || null;
  const settingKey = activeTeam?.setting || "residential";

  const { data: clients = [] } = useQuery({
    enabled: !!activeHomeId,
    queryKey: ["day-clients", activeHomeId],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, first_name, last_name, team_id, account_status")
        .eq("team_id", activeHomeId)
        .eq("account_status", "active")
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);

  const { data: ratios = [] } = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["day-ratios", clientIds.join(","), settingKey, date],
    queryFn: async (): Promise<Ratio[]> => {
      const { data, error } = await (supabase as any)
        .from("client_ratios")
        .select("client_id, setting, ratio_staff, ratio_clients, effective_start, effective_end")
        .in("client_id", clientIds)
        .eq("setting", settingKey)
        .lte("effective_start", date);
      if (error) throw error;
      return (data ?? []).filter((r: Ratio) => !r.effective_end || r.effective_end >= date);
    },
  });
  const ratioByClient = useMemo(
    () => new Map(ratios.map((r) => [r.client_id, r])),
    [ratios],
  );

  const { data: codes = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["day-codes", orgId],
    queryFn: async (): Promise<Code[]> => {
      const { data, error } = await (supabase as any)
        .from("provider_authorized_codes")
        .select("id, code, label, kind, carve_out")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .order("sort");
      if (error) throw error;
      return data ?? [];
    },
  });
  const codeById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes]);

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["day-shifts", clientIds.join(","), date],
    queryFn: async (): Promise<Shift[]> => {
      const { data, error } = await (supabase as any)
        .from("scheduled_shifts")
        .select("id, client_id, staff_id, code_id, job_code, starts_at, ends_at, published")
        .in("client_id", clientIds)
        .gte("starts_at", dayStart.toISOString())
        .lt("starts_at", dayEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const staffIds = useMemo(
    () => Array.from(new Set(shifts.map((s) => s.staff_id))),
    [shifts],
  );

  const { data: staff = [] } = useQuery({
    enabled: !!activeHomeId,
    queryKey: ["day-staff", activeHomeId, staffIds.join(",")],
    queryFn: async (): Promise<StaffMember[]> => {
      // staff designated to this home + any staff already on shifts
      const { data: hsd } = await (supabase as any)
        .from("home_staff_designations")
        .select("staff_id")
        .eq("team_id", activeHomeId);
      const ids = Array.from(
        new Set([...staffIds, ...(((hsd ?? []) as any[]).map((x) => x.staff_id))]),
      );
      if (ids.length === 0) return [];
      const { data: profs } = await (supabase as any)
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", ids);
      return (profs ?? []) as StaffMember[];
    },
  });
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const { data: evv = [] } = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["day-evv", clientIds.join(","), date],
    queryFn: async (): Promise<Evv[]> => {
      const { data, error } = await (supabase as any)
        .from("evv_timesheets")
        .select("staff_id, client_id, clock_in_timestamp, clock_out_timestamp")
        .in("client_id", clientIds)
        .gte("clock_in_timestamp", dayStart.toISOString())
        .lt("clock_in_timestamp", dayEnd.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // segments per client
  type ClientBlock = {
    shift: Shift;
    seg: Seg;
    kind: "continuous" | "discrete";
    carveOut: boolean;
    codeLabel: string;
  };
  const blocksByClient = useMemo(() => {
    const m = new Map<string, ClientBlock[]>();
    for (const s of shifts) {
      const seg: Seg = {
        start: minutesIntoDay(s.starts_at, dayStart),
        end: minutesIntoDay(s.ends_at, dayStart),
      };
      if (seg.end <= seg.start) continue;
      const code = s.code_id ? codeById.get(s.code_id) : null;
      const kind = (code?.kind as "continuous" | "discrete") ?? "continuous";
      const carveOut = code?.carve_out ?? false;
      const codeLabel = code?.code ?? s.job_code ?? "—";
      const arr = m.get(s.client_id) ?? [];
      arr.push({ shift: s, seg, kind, carveOut, codeLabel });
      m.set(s.client_id, arr);
    }
    return m;
  }, [shifts, dayStart, codeById]);

  // For each client, build visible blocks: continuous blocks minus carve_out discrete blocks on top.
  type RenderBlock = ClientBlock & { display: Seg[] };
  const renderByClient = useMemo(() => {
    const out = new Map<string, RenderBlock[]>();
    for (const [cid, arr] of blocksByClient) {
      const discreteCarve = arr.filter((b) => b.kind === "discrete" && b.carveOut).map((b) => b.seg);
      const rendered: RenderBlock[] = arr.map((b) => {
        if (b.kind === "continuous") {
          return { ...b, display: subtract(b.seg, discreteCarve) };
        }
        return { ...b, display: [b.seg] };
      });
      out.set(cid, rendered);
    }
    return out;
  }, [blocksByClient]);

  // Coverage status per client per minute-window. We compute the union of "covered" segments
  // (assigned staff count), required from ratio, and flag gaps + out-of-ratio windows.
  type Flag = { kind: "gap" | "under"; seg: Seg; required: number; assigned: number };
  const flagsByClient = useMemo(() => {
    const out = new Map<string, Flag[]>();
    for (const c of clients) {
      const ratio = ratioByClient.get(c.id);
      const required = ratio ? ratio.ratio_staff : 1; // assume 1 if unset
      const blocks = blocksByClient.get(c.id) ?? [];
      // Build event points
      const events = new Set<number>([0, DAY_MIN]);
      blocks.forEach((b) => {
        events.add(b.seg.start);
        events.add(b.seg.end);
      });
      const pts = Array.from(events).sort((a, b) => a - b);
      const flags: Flag[] = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const seg: Seg = { start: pts[i], end: pts[i + 1] };
        if (seg.end <= seg.start) continue;
        // assigned = number of distinct staff covering this client during the window
        const staffIn = new Set<string>();
        for (const b of blocks) {
          if (overlap(b.seg, seg) === seg.end - seg.start) {
            // For discrete carve-out blocks, that staff is "with" the client; same person counts.
            staffIn.add(b.shift.staff_id);
          }
        }
        const assigned = staffIn.size;
        if (assigned === 0) {
          flags.push({ kind: "gap", seg, required, assigned: 0 });
        } else if (assigned < required) {
          flags.push({ kind: "under", seg, required, assigned });
        }
      }
      // Merge consecutive
      const merged: Flag[] = [];
      for (const f of flags) {
        const last = merged[merged.length - 1];
        if (last && last.kind === f.kind && last.required === f.required && last.assigned === f.assigned && last.seg.end === f.seg.start) {
          last.seg = { start: last.seg.start, end: f.seg.end };
        } else {
          merged.push({ ...f });
        }
      }
      if (merged.length) out.set(c.id, merged);
    }
    return out;
  }, [clients, blocksByClient, ratioByClient]);

  // Cascade / strand check: a single staffer cannot cover two clients at the same minute
  // (1:1 carve-outs are valid because they're the same staffer with that client; but if the
  // SAME staffer is scheduled for two DIFFERENT clients in overlapping windows, they're stranded
  // — unless their continuous shift already covered both and they're carved out only for one
  // of them). We flag any staffer with >1 distinct client overlapping in time.
  type Strand = {
    staffId: string;
    seg: Seg;
    clientIds: string[];
    suggestion: { newStaffId: string; replaceShiftId: string } | null;
  };
  const strands = useMemo(() => {
    const out: Strand[] = [];
    const byStaff = new Map<string, Shift[]>();
    shifts.forEach((s) => {
      const arr = byStaff.get(s.staff_id) ?? [];
      arr.push(s);
      byStaff.set(s.staff_id, arr);
    });
    for (const [sid, arr] of byStaff) {
      // sweep
      const events: { t: number; clientId: string; shiftId: string; type: 1 | -1 }[] = [];
      arr.forEach((s) => {
        events.push({ t: minutesIntoDay(s.starts_at, dayStart), clientId: s.client_id, shiftId: s.id, type: 1 });
        events.push({ t: minutesIntoDay(s.ends_at, dayStart), clientId: s.client_id, shiftId: s.id, type: -1 });
      });
      events.sort((a, b) => a.t - b.t || a.type - b.type);
      const active = new Map<string, Set<string>>(); // clientId -> shiftIds
      let segStart = 0;
      const flushIfBad = (segEnd: number) => {
        if (active.size > 1 && segEnd > segStart) {
          const clientIds = Array.from(active.keys());
          // suggest a swap: pick a free home-designated staffer for the first conflicting shift
          const suggestion = pickBackfill(sid, clientIds, { start: segStart, end: segEnd }, arr);
          out.push({ staffId: sid, seg: { start: segStart, end: segEnd }, clientIds, suggestion });
        }
      };
      function pickBackfill(
        conflictingStaff: string,
        cids: string[],
        seg: Seg,
        ownShifts: Shift[],
      ): Strand["suggestion"] {
        // Pick the first shift among the conflicting clients to replace
        const candidateShift = ownShifts.find(
          (s) =>
            cids.includes(s.client_id) &&
            overlap(
              { start: minutesIntoDay(s.starts_at, dayStart), end: minutesIntoDay(s.ends_at, dayStart) },
              seg,
            ) > 0,
        );
        if (!candidateShift) return null;
        // free staff = home-designated staff not already on a shift in this window
        const busy = new Set<string>([conflictingStaff]);
        shifts.forEach((s) => {
          const oseg = { start: minutesIntoDay(s.starts_at, dayStart), end: minutesIntoDay(s.ends_at, dayStart) };
          if (overlap(oseg, seg) > 0) busy.add(s.staff_id);
        });
        const free = staff.find((s) => !busy.has(s.id));
        if (!free) return null;
        return { newStaffId: free.id, replaceShiftId: candidateShift.id };
      }
      for (const ev of events) {
        flushIfBad(ev.t);
        segStart = ev.t;
        if (ev.type === 1) {
          const set = active.get(ev.clientId) ?? new Set<string>();
          set.add(ev.shiftId);
          active.set(ev.clientId, set);
        } else {
          const set = active.get(ev.clientId);
          if (set) {
            set.delete(ev.shiftId);
            if (set.size === 0) active.delete(ev.clientId);
          }
        }
      }
    }
    return out;
  }, [shifts, staff, dayStart]);

  const backfillMut = useMutation({
    mutationFn: async (vars: { shiftId: string; newStaffId: string }) => {
      const { error } = await (supabase as any)
        .from("scheduled_shifts")
        .update({ staff_id: vars.newStaffId, status: "pending" })
        .eq("id", vars.shiftId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Backfill applied.");
      qc.invalidateQueries({ queryKey: ["day-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Live read summary
  const totalGapMin = useMemo(() => {
    let g = 0;
    for (const fs of flagsByClient.values())
      for (const f of fs) if (f.kind === "gap") g += f.seg.end - f.seg.start;
    return g;
  }, [flagsByClient]);
  const totalUnderMin = useMemo(() => {
    let g = 0;
    for (const fs of flagsByClient.values())
      for (const f of fs) if (f.kind === "under") g += f.seg.end - f.seg.start;
    return g;
  }, [flagsByClient]);

  // navigation
  const shiftDate = (delta: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(isoDate(d));
  };

  const isLoading = orgLoading || shiftsLoading;

  if (orgLoading) {
    return (
      <div className="grid place-items-center py-24 text-sm text-muted-foreground">
        <Loader2 className="mb-2 h-6 w-6 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeHomeId} onValueChange={setHomeId}>
            <SelectTrigger className="h-9 w-[240px] text-sm">
              <SelectValue placeholder="Pick a home" />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.team_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-[160px] text-sm"
            />
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-9" onClick={() => setDate(isoDate(new Date()))}>
              Today
            </Button>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={() => {
            setAddClient(clients[0]?.id ?? "");
            setAddOpen(true);
          }}
          disabled={clients.length === 0}
        >
          <Plus className="h-4 w-4" /> Add 1:1 carve-out
        </Button>
      </div>

      {/* Live read */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {totalGapMin === 0 && totalUnderMin === 0 ? (
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Everyone covered for the day.
            </span>
          ) : (
            <>
              {totalGapMin > 0 && (
                <Badge className="gap-1 border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-3 w-3" />
                  {formatMin(totalGapMin)} uncovered
                </Badge>
              )}
              {totalUnderMin > 0 && (
                <Badge className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> {formatMin(totalUnderMin)} out of ratio
                </Badge>
              )}
            </>
          )}
          {strands.length > 0 && (
            <Badge className="gap-1 border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
              <AlertTriangle className="h-3 w-3" /> {strands.length} staff conflict
              {strands.length > 1 ? "s" : ""}
            </Badge>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            Setting: <span className="font-medium text-foreground">{settingKey}</span> · advisory only
          </span>
        </div>
      </Card>

      {/* Timeline */}
      <Card className="overflow-hidden">
        <div className="relative">
          {/* Hour axis */}
          <div className="grid grid-cols-[160px_1fr] border-b border-border bg-muted/40 text-[10px] text-muted-foreground">
            <div className="px-3 py-2 font-medium">Client</div>
            <div className="relative h-8">
              {Array.from({ length: 25 }).map((_, h) => (
                <div
                  key={h}
                  className="absolute top-0 bottom-0 border-l border-border/60"
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  <span className="absolute left-0.5 top-1 -translate-x-1/2">{h === 0 || h === 24 ? "12a" : fmtTime(h * 60)}</span>
                </div>
              ))}
            </div>
          </div>

          {clients.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No clients in this home.
            </div>
          ) : (
            clients.map((c) => {
              const blocks = renderByClient.get(c.id) ?? [];
              const flags = flagsByClient.get(c.id) ?? [];
              const ratio = ratioByClient.get(c.id);
              const ratioLabel = ratio ? `${ratio.ratio_staff}:${ratio.ratio_clients}` : "—";
              const clientEvv = evv.filter((e) => e.client_id === c.id);
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[160px_1fr] border-b border-border last:border-b-0"
                >
                  <div className="flex flex-col justify-center gap-0.5 px-3 py-2">
                    <span className="truncate text-sm font-medium">
                      {c.first_name} {c.last_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Ratio {ratioLabel}</span>
                  </div>
                  <div className="relative h-16 bg-card">
                    {/* Overnight shading 10p-6a */}
                    <div
                      className="absolute inset-y-0 bg-slate-500/5"
                      style={{ left: 0, width: `${(6 / 24) * 100}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-slate-500/5"
                      style={{ left: `${(22 / 24) * 100}%`, right: 0 }}
                    />
                    {/* Hour gridlines */}
                    {Array.from({ length: 25 }).map((_, h) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 border-l border-border/30"
                        style={{ left: `${(h / 24) * 100}%` }}
                      />
                    ))}

                    {/* Flags */}
                    {flags.map((f, i) => (
                      <div
                        key={`flag-${i}`}
                        className={`absolute bottom-0 h-1.5 ${
                          f.kind === "gap" ? "bg-rose-500" : "bg-amber-500"
                        }`}
                        style={{
                          left: `${(f.seg.start / DAY_MIN) * 100}%`,
                          width: `${((f.seg.end - f.seg.start) / DAY_MIN) * 100}%`,
                        }}
                        title={
                          f.kind === "gap"
                            ? `Gap ${fmtTime(f.seg.start)}–${fmtTime(f.seg.end)}`
                            : `Out of ratio ${fmtTime(f.seg.start)}–${fmtTime(f.seg.end)} (${f.assigned}/${f.required})`
                        }
                      />
                    ))}

                    {/* Blocks */}
                    {blocks.flatMap((b) =>
                      b.display.map((seg, i) => {
                        const hue = colorForId(b.shift.staff_id);
                        const isDiscrete = b.kind === "discrete";
                        const sName =
                          staffById.get(b.shift.staff_id)?.full_name ??
                          staffById.get(b.shift.staff_id)?.email ??
                          "Unassigned";
                        return (
                          <div
                            key={`${b.shift.id}-${i}`}
                            className={`absolute top-2 bottom-3 overflow-hidden rounded text-[10px] text-white shadow-sm ${
                              isDiscrete ? "ring-2 ring-white/70" : ""
                            }`}
                            style={{
                              left: `${(seg.start / DAY_MIN) * 100}%`,
                              width: `${((seg.end - seg.start) / DAY_MIN) * 100}%`,
                              backgroundColor: isDiscrete
                                ? `hsl(${hue} 65% 38%)`
                                : `hsl(${hue} 55% 45%)`,
                            }}
                            title={`${sName} · ${b.codeLabel} · ${fmtTime(seg.start)}–${fmtTime(seg.end)}${
                              isDiscrete ? " (1:1)" : ""
                            }`}
                          >
                            <div className="flex h-full items-center gap-1 px-1.5">
                              <span className="truncate font-medium">{sName}</span>
                              <span className="rounded bg-black/30 px-1 font-mono">{b.codeLabel}</span>
                            </div>
                          </div>
                        );
                      }),
                    )}

                    {/* EVV ticks */}
                    {clientEvv.map((e, i) => {
                      const start = minutesIntoDay(e.clock_in_timestamp, dayStart);
                      const end = e.clock_out_timestamp
                        ? minutesIntoDay(e.clock_out_timestamp, dayStart)
                        : start + 5;
                      return (
                        <div
                          key={`evv-${i}`}
                          className="absolute top-0 h-1 bg-emerald-500"
                          style={{
                            left: `${(start / DAY_MIN) * 100}%`,
                            width: `${((end - start) / DAY_MIN) * 100}%`,
                          }}
                          title={`EVV ${fmtTime(start)}–${fmtTime(end)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Strand / cascade panel */}
      {strands.length > 0 && (
        <Card className="p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-rose-600" /> Strand check — staff double-booked
          </div>
          <ul className="space-y-2 text-sm">
            {strands.map((s, i) => {
              const sName = staffById.get(s.staffId)?.full_name ?? staffById.get(s.staffId)?.email ?? s.staffId.slice(0, 8);
              const cNames = s.clientIds
                .map((cid) => {
                  const c = clients.find((x) => x.id === cid);
                  return c ? `${c.first_name} ${c.last_name}` : cid.slice(0, 8);
                })
                .join(", ");
              const free = s.suggestion ? staffById.get(s.suggestion.newStaffId) : null;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-border/60 p-2">
                  <span>
                    <span className="font-medium">{sName}</span> covers{" "}
                    <span className="font-medium">{cNames}</span> from{" "}
                    {fmtTime(s.seg.start)}–{fmtTime(s.seg.end)}.
                  </span>
                  {s.suggestion && free ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto gap-1.5"
                      disabled={backfillMut.isPending}
                      onClick={() => backfillMut.mutate({ shiftId: s.suggestion!.replaceShiftId, newStaffId: s.suggestion!.newStaffId })}
                    >
                      <Wand2 className="h-3.5 w-3.5" /> Backfill with {free.full_name ?? free.email}
                    </Button>
                  ) : (
                    <span className="ml-auto text-xs text-muted-foreground">No free qualified staff to suggest.</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-slate-500" /> Continuous shift
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-slate-500 ring-2 ring-white/80" /> 1:1 carve-out
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 bg-rose-500" /> Gap
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-4 bg-amber-500" /> Out of ratio
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1 w-4 bg-emerald-500" /> EVV clock-in
        </span>
        <span className="flex items-center gap-1">
          <Moon className="h-3 w-3" /> Overnight shading 10p–6a
        </span>
      </div>

      <AddCarveOutDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients}
        staff={staff}
        codes={codes.filter((c) => c.kind === "discrete" && c.carve_out)}
        date={date}
        orgId={orgId ?? ""}
        defaultClientId={addClient}
        onCreated={() => qc.invalidateQueries({ queryKey: ["day-shifts"] })}
      />

      {isLoading && (
        <div className="text-xs text-muted-foreground">Refreshing…</div>
      )}
    </div>
  );
}

function formatMin(m: number) {
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

function AddCarveOutDialog({
  open,
  onOpenChange,
  clients,
  staff,
  codes,
  date,
  orgId,
  defaultClientId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clients: Client[];
  staff: StaffMember[];
  codes: Code[];
  date: string;
  orgId: string;
  defaultClientId: string;
  onCreated: () => void;
}) {
  const [clientId, setClientId] = useState(defaultClientId);
  const [staffId, setStaffId] = useState("");
  const [codeId, setCodeId] = useState("");
  const [start, setStart] = useState(`${date}T09:00`);
  const [end, setEnd] = useState(`${date}T10:00`);
  const [busy, setBusy] = useState(false);

  // sync when reopened
  useMemo(() => {
    setClientId(defaultClientId);
    setStart(`${date}T09:00`);
    setEnd(`${date}T10:00`);
  }, [defaultClientId, date, open]);

  async function save() {
    if (!clientId || !staffId || !codeId || !start || !end) {
      toast.error("Fill all fields.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("End must be after start.");
      return;
    }
    setBusy(true);
    try {
      const code = codes.find((c) => c.id === codeId);
      const { error } = await (supabase as any).from("scheduled_shifts").insert({
        organization_id: orgId,
        client_id: clientId,
        staff_id: staffId,
        code_id: codeId,
        job_code: code?.code ?? null,
        shift_type: "hourly",
        starts_at: new Date(start).toISOString(),
        ends_at: new Date(end).toISOString(),
        status: "pending",
        published: false,
      });
      if (error) throw error;
      toast.success("1:1 carve-out added.");
      onCreated();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add 1:1 carve-out</DialogTitle>
          <DialogDescription>
            Adds a discrete service (e.g. DSI, SEI, ELS) that carves out of the continuous code for the chosen window.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Service code</Label>
            <Select value={codeId} onValueChange={setCodeId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder={codes.length === 0 ? "No discrete carve-out codes configured" : "Code"} />
              </SelectTrigger>
              <SelectContent>
                {codes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="font-mono mr-2">{c.code}</span>{c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Staffer</Label>
            <Select value={staffId} onValueChange={setStaffId}>
              <SelectTrigger className="text-sm"><SelectValue placeholder="Staffer" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name ?? s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Start</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">End</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
