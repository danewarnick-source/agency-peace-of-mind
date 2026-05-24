import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { useEffectiveView } from "@/hooks/use-effective-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarPlus, Loader2, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock as ClockIcon, Home, ClipboardCheck, Pencil } from "lucide-react";
import { toast } from "sonner";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/scheduler")({
  head: () => ({ meta: [{ title: "Scheduler — Care Academy" }] }),
  component: SchedulerRoute,
});

type ScheduledShift = {
  id: string;
  organization_id: string;
  staff_id: string;
  client_id: string;
  job_code: string | null;
  shift_type: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
};

type StaffRow = { id: string; name: string };
type ClientRow = { id: string; first_name: string; last_name: string; job_code: string[] | null };

function startOfWeek(d: Date) {
  const x = new Date(d);
  const dow = x.getDay();
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function fmtDay(d: Date) { return d.toLocaleDateString(undefined, { weekday: "short", month: "numeric", day: "numeric" }); }
function dateKey(d: Date) { return d.toISOString().slice(0, 10); }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SchedulerRoute() {
  const { effective } = useEffectiveView();
  if (effective === "admin") return <AdminScheduler />;
  return <StaffScheduler />;
}

/* ----------------------------- ADMIN VIEW ----------------------------- */

function AdminScheduler() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [addCtx, setAddCtx] = useState<{ date: Date; staffId?: string } | null>(null);
  const [editShift, setEditShift] = useState<ScheduledShift | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: staff } = useQuery({
    enabled: !!org,
    queryKey: ["sched-staff", org?.organization_id],
    queryFn: async (): Promise<StaffRow[]> => {
      const { data: mems } = await supabase
        .from("organization_members").select("user_id")
        .eq("organization_id", org!.organization_id).eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["sched-clients", org?.organization_id],
    queryFn: async (): Promise<ClientRow[]> => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name, job_code")
        .eq("organization_id", org!.organization_id).order("last_name");
      return (data ?? []) as ClientRow[];
    },
  });

  const weekEnd = addDays(weekStart, 7);
  const { data: shifts } = useQuery({
    enabled: !!org,
    queryKey: ["scheduled-shifts", org?.organization_id, weekStart.toISOString()],
    queryFn: async (): Promise<ScheduledShift[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString())
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledShift[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("scheduled_shifts" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift removed");
      qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
      setEditShift(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: async ({ shift, targetDate, targetStaffId }: { shift: ScheduledShift; targetDate: Date; targetStaffId?: string }) => {
      const oldStart = new Date(shift.starts_at);
      const oldEnd = new Date(shift.ends_at);
      const durationMs = oldEnd.getTime() - oldStart.getTime();
      const newStart = new Date(targetDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);
      const payload: Record<string, unknown> = {
        starts_at: newStart.toISOString(),
        ends_at: newEnd.toISOString(),
      };
      if (targetStaffId) payload.staff_id = targetStaffId;
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any)
        .update(payload)
        .eq("id", shift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift rescheduled");
      qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // index by staff -> day
  const byStaffDay = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    (shifts ?? []).forEach((s) => {
      const k = `${s.staff_id}|${dateKey(new Date(s.starts_at))}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    });
    return map;
  }, [shifts]);

  const clientName = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const handleDrop = (targetDate: Date, targetStaffId: string) => {
    if (!dragId || !shifts) return;
    const shift = shifts.find((s) => s.id === dragId);
    setDragId(null);
    if (!shift) return;
    if (dateKey(new Date(shift.starts_at)) === dateKey(targetDate) && shift.staff_id === targetStaffId) return;
    moveMut.mutate({ shift, targetDate, targetStaffId });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarIcon className="h-6 w-6 text-muted-foreground" /> Scheduler — Roster Board
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Click any empty cell to create a shift. Drag a shift to reschedule or reassign.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddCtx({ date: weekStart })}>
          <CalendarPlus className="mr-2 h-4 w-4" /> Add shift
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Previous
        </Button>
        <p className="text-sm font-medium">
          Week of {weekStart.toLocaleDateString()} – {addDays(weekStart, 6).toLocaleDateString()}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
          <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="min-w-[900px]">
          {/* Header row */}
          <div className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-border bg-secondary/40">
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Employee
            </div>
            {days.map((d) => {
              const isToday = dateKey(d) === dateKey(new Date());
              return (
                <div
                  key={dateKey(d)}
                  className={`px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider ${
                    isToday ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {fmtDay(d)}
                </div>
              );
            })}
          </div>

          {/* Staff rows */}
          {(staff ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No employees in this organization yet.</div>
          ) : (
            (staff ?? []).map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-[180px_repeat(7,minmax(0,1fr))] border-b border-border last:border-b-0"
              >
                <div className="border-r border-border px-3 py-3 text-sm font-medium">
                  {s.name}
                </div>
                {days.map((d) => {
                  const items = byStaffDay.get(`${s.id}|${dateKey(d)}`) ?? [];
                  const hhs = items.filter((i) => i.shift_type === "daily_host_home");
                  const hourly = items.filter((i) => i.shift_type !== "daily_host_home");
                  return (
                    <div
                      key={dateKey(d)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(d, s.id)}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("[data-shift-block]")) return;
                        setAddCtx({ date: d, staffId: s.id });
                      }}
                      className={`group/cell relative min-h-[88px] cursor-pointer border-r border-border p-1.5 last:border-r-0 transition-colors hover:bg-primary/5 ${dragId ? "hover:bg-primary/10" : ""}`}
                    >
                      {hhs.length > 0 && (
                        <div className="mb-1 space-y-1">
                          {hhs.map((s2) => (
                            <ShiftBlock
                              key={s2.id}
                              shift={s2}
                              clientName={clientName(s2.client_id)}
                              onEdit={() => setEditShift(s2)}
                              onDragStart={() => setDragId(s2.id)}
                              onDragEnd={() => setDragId(null)}
                              dragging={dragId === s2.id}
                              variant="hhs-banner"
                            />
                          ))}
                        </div>
                      )}
                      <div className="space-y-1">
                        {hourly.map((s2) => (
                          <ShiftBlock
                            key={s2.id}
                            shift={s2}
                            clientName={clientName(s2.client_id)}
                            onEdit={() => setEditShift(s2)}
                            onDragStart={() => setDragId(s2.id)}
                            onDragEnd={() => setDragId(null)}
                            dragging={dragId === s2.id}
                            variant="hourly"
                          />
                        ))}
                      </div>
                      {items.length === 0 && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100">
                          + Add shift
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Add */}
      <Dialog open={!!addCtx} onOpenChange={(o) => { if (!o) setAddCtx(null); }}>
        {addCtx && (
          <AddShiftDialog
            staff={staff ?? []}
            clients={clients ?? []}
            defaultDate={addCtx.date}
            defaultStaffId={addCtx.staffId}
            onClose={() => setAddCtx(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
              setAddCtx(null);
            }}
          />
        )}
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editShift} onOpenChange={(o) => { if (!o) setEditShift(null); }}>
        {editShift && (
          <EditShiftDialog
            shift={editShift}
            staff={staff ?? []}
            clients={clients ?? []}
            onClose={() => setEditShift(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
              setEditShift(null);
            }}
            onDelete={() => deleteMut.mutate(editShift.id)}
          />
        )}
      </Dialog>
    </div>
  );
}

function ShiftBlock({
  shift, clientName, onEdit, onDragStart, onDragEnd, dragging, variant,
}: {
  shift: ScheduledShift;
  clientName: string;
  onEdit: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  variant: "hourly" | "hhs-banner";
}) {
  const isHhs = variant === "hhs-banner";
  return (
    <button
      type="button"
      data-shift-block
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onEdit(); }}
      className={`block w-full cursor-grab rounded-md border px-1.5 py-1 text-left text-[11px] transition active:cursor-grabbing ${
        dragging ? "opacity-40" : ""
      } ${
        isHhs
          ? "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-100"
          : "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-100"
      }`}
      title="Click to edit"
    >
      <div className="flex items-center gap-1 font-medium">
        {isHhs ? <Home className="h-3 w-3" /> : <ClockIcon className="h-3 w-3" />}
        <span className="truncate">
          {isHhs ? "🏠 HHS Day Log" : `⏱️ ${fmtTime(shift.starts_at)}–${fmtTime(shift.ends_at)}`}
        </span>
      </div>
      <div className="truncate text-[10px] opacity-80">{clientName}</div>
      {shift.job_code && !isHhs && (
        <Badge variant="outline" className="mt-0.5 h-4 px-1 font-mono text-[9px]">{shift.job_code}</Badge>
      )}
    </button>
  );
}

/* ----------------------------- STAFF VIEW ----------------------------- */

function StaffScheduler() {
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const weekEnd = addDays(weekStart, 7);

  const { data: shifts, isLoading } = useQuery({
    enabled: !!org && !!user,
    queryKey: ["my-scheduled-shifts", org?.organization_id, user?.id, weekStart.toISOString()],
    queryFn: async (): Promise<ScheduledShift[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any)
        .select("*")
        .eq("organization_id", org!.organization_id)
        .eq("staff_id", user!.id)
        .gte("starts_at", weekStart.toISOString())
        .lt("starts_at", weekEnd.toISOString())
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledShift[];
    },
  });

  const clientIds = useMemo(() => Array.from(new Set((shifts ?? []).map((s) => s.client_id))), [shifts]);
  const { data: clients } = useQuery({
    enabled: clientIds.length > 0,
    queryKey: ["my-shift-clients", clientIds.join(",")],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name").in("id", clientIds);
      return data ?? [];
    },
  });
  const nameOf = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const grouped = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    (shifts ?? []).forEach((s) => {
      const k = dateKey(new Date(s.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <CalendarIcon className="h-6 w-6 text-muted-foreground" /> My Schedule
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your upcoming shifts for the week. Tap a shift to start your clock-in or daily journal.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Prev
        </Button>
        <p className="text-xs font-medium">
          {weekStart.toLocaleDateString()} – {addDays(weekStart, 6).toLocaleDateString()}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          Next <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-8 text-center">
          <CalendarIcon className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No shifts scheduled this week</p>
          <p className="mt-1 text-xs text-muted-foreground">Check back later or contact your administrator.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, items]) => {
            const d = new Date(day + "T00:00:00");
            const isToday = day === dateKey(new Date());
            return (
              <div key={day}>
                <div className="mb-2 flex items-center gap-2">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  {isToday && <Badge variant="outline" className="border-primary/40 text-[10px] text-primary">Today</Badge>}
                </div>
                <div className="space-y-2">
                  {items.map((s) => {
                    const isHhs = s.shift_type === "daily_host_home";
                    return (
                      <Card key={s.id} className="overflow-hidden p-0">
                        <div className={`h-1 ${isHhs ? "bg-violet-500" : "bg-sky-500"}`} />
                        <div className="space-y-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold">{nameOf(s.client_id)}</p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {isHhs ? "All day" : `${fmtTime(s.starts_at)} – ${fmtTime(s.ends_at)}`}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {s.job_code && <Badge variant="outline" className="font-mono text-[10px]">{s.job_code}</Badge>}
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${isHhs
                                  ? "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200"
                                  : "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200"}`}
                              >
                                {isHhs ? <><Home className="mr-1 h-3 w-3" /> HHS Day Log</> : <><ClockIcon className="mr-1 h-3 w-3" /> Hourly</>}
                              </Badge>
                            </div>
                          </div>

                          {isHhs ? (
                            <Button asChild size="sm" className="w-full bg-violet-600 hover:bg-violet-700">
                              <Link
                                to="/dashboard/daily-logs"
                                search={{ clientId: s.client_id } as never}
                              >
                                <ClipboardCheck className="mr-2 h-4 w-4" /> 📝 Open Daily Journal
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild size="sm" className="w-full">
                              <Link
                                to="/dashboard/timeclock"
                                search={{ clientId: s.client_id, jobCode: s.job_code ?? undefined } as never}
                              >
                                <ClockIcon className="mr-2 h-4 w-4" /> 🚀 Open in Time Clock
                              </Link>
                            </Button>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- DIALOGS ----------------------------- */

function AddShiftDialog({
  staff, clients, defaultDate, defaultStaffId, onClose, onSaved,
}: {
  staff: StaffRow[];
  clients: ClientRow[];
  defaultDate: Date;
  defaultStaffId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: org } = useCurrentOrg();
  const [staffId, setStaffId] = useState(defaultStaffId ?? "");
  const [clientId, setClientId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [shiftType, setShiftType] = useState<"hourly" | "daily_host_home">("hourly");
  const [date, setDate] = useState(dateKey(defaultDate));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientCodes = selectedClient?.job_code ?? [];

  // If HHS-only client gets selected, auto-flip
  useEffect(() => {
    if (clientCodes.length === 1 && clientCodes[0] === "HHS") {
      setShiftType("daily_host_home");
      setJobCode("HHS");
    }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = staffId && clientId && date && startTime && endTime && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !org) return;
    setSaving(true);
    try {
      const starts = new Date(`${date}T${startTime}:00`).toISOString();
      const ends = new Date(`${date}T${endTime}:00`).toISOString();
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any).insert({
          organization_id: org.organization_id,
          staff_id: staffId,
          client_id: clientId,
          job_code: jobCode || null,
          shift_type: shiftType,
          starts_at: starts,
          ends_at: ends,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      toast.success("Shift scheduled");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Schedule a shift</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="grid gap-3">
        <div className="grid gap-2">
          <Label>Staff member</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setJobCode(""); }}>
            <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Billing code {clientId && <span className="text-xs text-muted-foreground">(client's active codes only)</span>}</Label>
          <Select value={jobCode} onValueChange={setJobCode} disabled={!clientId}>
            <SelectTrigger><SelectValue placeholder={clientId ? "Select code" : "Select a client first"} /></SelectTrigger>
            <SelectContent>
              {(clientCodes.length ? clientCodes : []).map((code) => (
                <SelectItem key={code} value={code}>{jobCodeLabel(code)}</SelectItem>
              ))}
              {clientId && clientCodes.length === 0 && (
                <div className="px-2 py-1 text-xs text-muted-foreground">No billing codes on this client's profile.</div>
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Shift type</Label>
          <Select value={shiftType} onValueChange={(v) => setShiftType(v as "hourly" | "daily_host_home")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">⏱️ Hourly Shift</SelectItem>
              <SelectItem value="daily_host_home">🏠 Daily Host Home (HHS)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Start</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>End</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!canSubmit}>
            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : "Schedule shift"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function EditShiftDialog({
  shift, staff, clients, onClose, onSaved, onDelete,
}: {
  shift: ScheduledShift;
  staff: StaffRow[];
  clients: ClientRow[];
  onClose: () => void;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const initialStart = new Date(shift.starts_at);
  const initialEnd = new Date(shift.ends_at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const [staffId, setStaffId] = useState(shift.staff_id);
  const [clientId, setClientId] = useState(shift.client_id);
  const [jobCode, setJobCode] = useState(shift.job_code ?? "");
  const [shiftType, setShiftType] = useState<"hourly" | "daily_host_home">(
    (shift.shift_type === "daily_host_home" ? "daily_host_home" : "hourly")
  );
  const [date, setDate] = useState(dateKey(initialStart));
  const [startTime, setStartTime] = useState(`${pad(initialStart.getHours())}:${pad(initialStart.getMinutes())}`);
  const [endTime, setEndTime] = useState(`${pad(initialEnd.getHours())}:${pad(initialEnd.getMinutes())}`);
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientCodes = selectedClient?.job_code ?? [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const starts = new Date(`${date}T${startTime}:00`).toISOString();
      const ends = new Date(`${date}T${endTime}:00`).toISOString();
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any)
        .update({
          staff_id: staffId,
          client_id: clientId,
          job_code: jobCode || null,
          shift_type: shiftType,
          starts_at: starts,
          ends_at: ends,
        })
        .eq("id", shift.id);
      if (error) throw error;
      toast.success("Shift updated");
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Edit shift</DialogTitle></DialogHeader>
      <form onSubmit={save} className="grid gap-3">
        <div className="grid gap-2">
          <Label>Reassign worker</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Client</Label>
          <Select value={clientId} onValueChange={(v) => { setClientId(v); setJobCode(""); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Billing code</Label>
          <Select value={jobCode} onValueChange={setJobCode}>
            <SelectTrigger><SelectValue placeholder="Select code" /></SelectTrigger>
            <SelectContent>
              {(clientCodes.length ? clientCodes : JOB_CODES.map((j) => j.code)).map((code) => (
                <SelectItem key={code} value={code}>{jobCodeLabel(code)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Shift type</Label>
          <Select value={shiftType} onValueChange={(v) => setShiftType(v as "hourly" | "daily_host_home")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hourly">⏱️ Hourly Shift</SelectItem>
              <SelectItem value="daily_host_home">🏠 Daily Host Home (HHS)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Start</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>End</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete Shift
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</> : <><Pencil className="mr-2 h-4 w-4" /> Update Shift</>}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
