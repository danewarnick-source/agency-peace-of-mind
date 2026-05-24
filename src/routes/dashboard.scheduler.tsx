import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { CalendarPlus, Loader2, Trash2, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { JOB_CODES, jobCodeLabel } from "@/lib/job-codes";

export const Route = createFileRoute("/dashboard/scheduler")({
  head: () => ({ meta: [{ title: "Scheduler — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <SchedulerPage />
    </RequirePermission>
  ),
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

function SchedulerPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [addOpen, setAddOpen] = useState(false);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const { data: staff } = useQuery({
    enabled: !!org,
    queryKey: ["sched-staff", org?.organization_id],
    queryFn: async () => {
      const { data: mems } = await supabase
        .from("organization_members").select("user_id")
        .eq("organization_id", org!.organization_id).eq("active", true);
      const ids = (mems ?? []).map((m) => m.user_id);
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
      return (profs ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const { data: clients } = useQuery({
    enabled: !!org,
    queryKey: ["sched-clients", org?.organization_id],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("id, first_name, last_name, job_code")
        .eq("organization_id", org!.organization_id).order("last_name");
      return data ?? [];
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
      toast.success("Shift removed from schedule");
      qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const moveMut = useMutation({
    mutationFn: async ({ shift, targetDate }: { shift: ScheduledShift; targetDate: Date }) => {
      const oldStart = new Date(shift.starts_at);
      const oldEnd = new Date(shift.ends_at);
      const durationMs = oldEnd.getTime() - oldStart.getTime();
      const newStart = new Date(targetDate);
      newStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0);
      const newEnd = new Date(newStart.getTime() + durationMs);
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("scheduled_shifts" as any)
        .update({ starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() })
        .eq("id", shift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift rescheduled");
      qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    (shifts ?? []).forEach((s) => {
      const k = dateKey(new Date(s.starts_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    });
    return map;
  }, [shifts]);

  const staffName = (id: string) => staff?.find((s) => s.id === id)?.name ?? "—";
  const clientName = (id: string) => {
    const c = clients?.find((x) => x.id === id);
    return c ? `${c.first_name} ${c.last_name}` : "—";
  };

  const handleDrop = (targetDate: Date) => {
    if (!dragId || !shifts) return;
    const shift = shifts.find((s) => s.id === dragId);
    setDragId(null);
    if (!shift) return;
    if (dateKey(new Date(shift.starts_at)) === dateKey(targetDate)) return;
    moveMut.mutate({ shift, targetDate });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <CalendarIcon className="h-6 w-6 text-muted-foreground" /> Scheduler
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag a shift to another day to reschedule it. Hover an empty day to quick-add.
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><CalendarPlus className="mr-2 h-4 w-4" /> Add shift</Button>
          </DialogTrigger>
          <AddShiftDialog
            staff={staff ?? []}
            clients={clients ?? []}
            defaultDate={weekStart}
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
              setAddOpen(false);
            }}
          />
        </Dialog>
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d) => {
          const items = byDay.get(dateKey(d)) ?? [];
          const isToday = dateKey(d) === dateKey(new Date());
          return (
            <Card
              key={dateKey(d)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={() => handleDrop(d)}
              className={`group/day relative min-h-[180px] p-3 transition-colors ${isToday ? "ring-2 ring-primary/40" : ""} ${dragId ? "hover:bg-primary/5" : ""}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fmtDay(d)}</p>
                <button
                  type="button"
                  onClick={() => setQuickAddDate(d)}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/day:opacity-100"
                  aria-label="Quick add shift"
                  title="Quick add shift"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No shifts</p>
              ) : (
                <div className="space-y-2">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      draggable
                      onDragStart={() => setDragId(s.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`group rounded-lg border border-border bg-secondary/30 p-2 text-xs transition-opacity cursor-grab active:cursor-grabbing ${dragId === s.id ? "opacity-40" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="font-medium">{staffName(s.staff_id)}</p>
                        <button
                          onClick={() => deleteMut.mutate(s.id)}
                          className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-muted-foreground">{clientName(s.client_id)}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {s.job_code && <Badge variant="outline" className="font-mono text-[10px]">{s.job_code}</Badge>}
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            s.shift_type === "daily_host_home"
                              ? "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200"
                              : "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200"
                          }`}
                        >
                          {s.shift_type === "daily_host_home" ? "Daily HHA" : "Hourly"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(s.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
                        {new Date(s.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!quickAddDate} onOpenChange={(o) => { if (!o) setQuickAddDate(null); }}>
        {quickAddDate && (
          <AddShiftDialog
            staff={staff ?? []}
            clients={clients ?? []}
            defaultDate={quickAddDate}
            onClose={() => setQuickAddDate(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["scheduled-shifts"] });
              setQuickAddDate(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

function AddShiftDialog({
  staff, clients, defaultDate, onClose, onSaved,
}: {
  staff: { id: string; name: string }[];
  clients: { id: string; first_name: string; last_name: string; job_code: string[] | null }[];
  defaultDate: Date;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: org } = useCurrentOrg();
  const [staffId, setStaffId] = useState("");
  const [clientId, setClientId] = useState("");
  const [jobCode, setJobCode] = useState("");
  const [shiftType, setShiftType] = useState<"hourly" | "daily_host_home">("hourly");
  const [date, setDate] = useState(dateKey(defaultDate));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const clientCodes = selectedClient?.job_code ?? [];

  const canSubmit = staffId && clientId && date && startTime && endTime && !saving;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !org) return;
    setSaving(true);
    try {
      const starts = new Date(`${date}T${startTime}:00`).toISOString();
      const ends = new Date(`${date}T${endTime}:00`).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("scheduled_shifts" as any).insert({
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
          <Label>Job code</Label>
          <Select value={jobCode} onValueChange={setJobCode}>
            <SelectTrigger><SelectValue placeholder="Select code (optional)" /></SelectTrigger>
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
              <SelectItem value="hourly">Hourly Shift</SelectItem>
              <SelectItem value="daily_host_home">Daily Host Home Shift</SelectItem>
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
