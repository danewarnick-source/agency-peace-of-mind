import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Truck } from "lucide-react";
import { RequireRole } from "@/components/rbac-guard";
import {
  listDayProgramSessions,
  createDayProgramSession,
  getDayProgramSession,
  upsertDayProgramAttendance,
  upsertDayProgramTransport,
  deleteDayProgramSession,
} from "@/lib/day-program.functions";
import { RATE_CAPS, dspModeForMinutes, dsiTierForMinutes, MTP_FLAT_RATE } from "@/lib/day-program-billing";

export const Route = createFileRoute("/dashboard/day-program")({
  head: () => ({ meta: [{ title: "Day Program — HIVE" }] }),
  component: () => (
    <RequireRole roles={["admin", "manager", "super_admin"]}>
      <DayProgramPage />
    </RequireRole>
  ),
});

type DayCode = "DSG" | "DSP" | "DSI" | "SED";
type Client = { id: string; first_name: string; last_name: string };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function DayProgramPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const listFn = useServerFn(listDayProgramSessions);
  const createFn = useServerFn(createDayProgramSession);
  const deleteFn = useServerFn(deleteDayProgramSession);

  const [from] = useState(daysAgo(30));
  const [to] = useState(todayStr());
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const sessionsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["day-program-sessions", orgId, from, to],
    queryFn: () => listFn({ data: { organizationId: orgId!, from, to } }),
  });

  const deleteM = useMutation({
    mutationFn: (sessionId: string) => deleteFn({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["day-program-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Day Program Sessions</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            DSG / DSP / DSI / SED. Billing emits per client per day from attendance — staff clock-in is for
            labor only. Rates honor the RFS-authorized per-client rate, capped at the fee schedule. MTP is a
            flat ${MTP_FLAT_RATE.toFixed(2)}/day and only bills when a DSG/DSP/SED unit exists for that
            client on the same day.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="min-h-11">
          <Plus className="h-4 w-4 mr-1" /> New Session
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions ({from} → {to})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {sessionsQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (sessionsQ.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No sessions yet — create one to get started.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Code</th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(sessionsQ.data ?? []).map((s) => {
                  const start = new Date(s.start_time);
                  const end = new Date(s.end_time);
                  const fmt = (d: Date) =>
                    d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{s.session_date}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{s.service_code}</Badge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmt(start)} – {fmt(end)}</td>
                      <td className="py-2 pr-3">{s.location_label ?? "—"}</td>
                      <td className="py-2 pr-3 text-right space-x-2 whitespace-nowrap">
                        <Button size="sm" variant="outline" className="min-h-11" onClick={() => setOpenSessionId(s.id)}>
                          Roster
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-11"
                          onClick={() => {
                            if (confirm("Delete this session and its attendance?")) {
                              deleteM.mutate(s.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {createOpen && orgId && (
        <CreateSessionDialog
          orgId={orgId}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={() => qc.invalidateQueries({ queryKey: ["day-program-sessions"] })}
          createFn={createFn}
        />
      )}

      {openSessionId && (
        <SessionRosterDialog
          sessionId={openSessionId}
          orgId={orgId!}
          onClose={() => setOpenSessionId(null)}
        />
      )}
    </div>
  );
}

// ─── Create session dialog ────────────────────────────────────────────────
function CreateSessionDialog({
  orgId,
  open,
  onOpenChange,
  onCreated,
  createFn,
}: {
  orgId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
  createFn: ReturnType<typeof useServerFn<typeof createDayProgramSession>>;
}) {
  const [date, setDate] = useState(todayStr());
  const [code, setCode] = useState<DayCode>("DSG");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("15:00");
  const [locationLabel, setLocationLabel] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const startIso = new Date(`${date}T${startTime}:00`).toISOString();
      const endIso = new Date(`${date}T${endTime}:00`).toISOString();
      return createFn({
        data: {
          organizationId: orgId,
          sessionDate: date,
          serviceCode: code,
          startTime: startIso,
          endTime: endIso,
          locationLabel: locationLabel || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Session created");
      onCreated();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Day Program Session</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Service code</Label>
              <Select value={code} onValueChange={(v) => setCode(v as DayCode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DSG">DSG — Day Supports Group</SelectItem>
                  <SelectItem value="DSP">DSP — Partial/Extended</SelectItem>
                  <SelectItem value="DSI">DSI — Individual (1:1)</SelectItem>
                  <SelectItem value="SED">SED — Supported Employment Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Location (licensed/certified day site — not a residence)</Label>
            <Input
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="e.g. TNS Day Center — Main"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Roster dialog (attendance + transport per client) ────────────────────
type AttendanceRow = {
  id: string;
  session_id: string;
  client_id: string;
  attended: boolean;
  arrival_time: string | null;
  departure_time: string | null;
  activity_note: string | null;
  billed_code: string | null;
  billed_mode: string | null;
  billed_units: number | null;
  billed_rate: number | null;
  cap_snapshot: number | null;
  transport: {
    id: string;
    pickup_location: string | null;
    pickup_time: string | null;
    dropoff_location: string | null;
    dropoff_time: string | null;
    mtp_billed: boolean;
    mtp_block_reason: string | null;
  } | null;
};
    id: string;
    pickup_location: string | null;
    pickup_time: string | null;
    dropoff_location: string | null;
    dropoff_time: string | null;
    mtp_billed: boolean;
    mtp_block_reason: string | null;
  }>;
};

function SessionRosterDialog({
  sessionId,
  orgId,
  onClose,
}: {
  sessionId: string;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getDayProgramSession);
  const upsertAttendance = useServerFn(upsertDayProgramAttendance);
  const upsertTransport = useServerFn(upsertDayProgramTransport);

  const detailQ = useQuery({
    queryKey: ["day-program-session", sessionId],
    queryFn: () => getFn({ data: { sessionId } }),
  });

  const clientsQ = useQuery({
    queryKey: ["org-clients-min", orgId],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const session = detailQ.data?.session as
    | { id: string; service_code: DayCode; session_date: string; start_time: string; end_time: string }
    | undefined;
  const attendance = (detailQ.data?.attendance ?? []) as AttendanceRow[];
  const byClient = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const a of attendance) m.set(a.client_id, a);
    return m;
  }, [attendance]);

  const [addClientId, setAddClientId] = useState<string>("");

  const attendanceM = useMutation({
    mutationFn: async (input: Parameters<typeof upsertAttendance>[0]["data"]) =>
      upsertAttendance({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-program-session", sessionId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const transportM = useMutation({
    mutationFn: async (input: Parameters<typeof upsertTransport>[0]["data"]) =>
      upsertTransport({ data: input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["day-program-session", sessionId] });
      if (res?.mtp_block_reason) toast.warning(res.mtp_block_reason);
      else toast.success("Transport saved — MTP will bill.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessionMinutes = session
    ? (new Date(session.end_time).getTime() - new Date(session.start_time).getTime()) / 60_000
    : 0;
  const dspModeHint = session?.service_code === "DSP" ? dspModeForMinutes(sessionMinutes) : null;
  const dsiTierHint = session?.service_code === "DSI" ? dsiTierForMinutes(sessionMinutes) : null;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Roster — {session?.service_code} {session?.session_date}
          </DialogTitle>
        </DialogHeader>

        {session?.service_code === "DSP" && dspModeHint?.ambiguous && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
            {dspModeHint.reason}
          </div>
        )}
        {session?.service_code === "DSI" && dsiTierHint && (
          <div className="text-xs text-muted-foreground">
            DSI tier (session length): {dsiTierHint.tierHours}h — cap ${dsiTierHint.cap.toFixed(2)}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-2">
          <Select value={addClientId} onValueChange={setAddClientId}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Add client to roster…" /></SelectTrigger>
            <SelectContent>
              {(clientsQ.data ?? []).filter((c) => !byClient.has(c.id)).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.last_name}, {c.first_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            disabled={!addClientId}
            onClick={() => {
              attendanceM.mutate({
                sessionId,
                clientId: addClientId,
                attended: false,
              });
              setAddClientId("");
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>

        <div className="space-y-3">
          {attendance.length === 0 && (
            <div className="text-sm text-muted-foreground">No clients on roster yet.</div>
          )}
          {attendance.map((a) => {
            const client = (clientsQ.data ?? []).find((c) => c.id === a.client_id);
            const transport = a.transport?.[0];
            return (
              <Card key={a.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="font-medium">
                      {client ? `${client.last_name}, ${client.first_name}` : a.client_id}
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={a.attended}
                        onCheckedChange={(v) =>
                          attendanceM.mutate({
                            sessionId,
                            clientId: a.client_id,
                            attended: !!v,
                            arrivalTime: a.arrival_time,
                            departureTime: a.departure_time,
                            activityNote: a.activity_note,
                          })
                        }
                      />
                      Attended
                    </label>
                  </div>
                  {a.attended && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Arrival</Label>
                        <Input
                          type="datetime-local"
                          defaultValue={a.arrival_time?.slice(0, 16) ?? ""}
                          onBlur={(e) =>
                            attendanceM.mutate({
                              sessionId,
                              clientId: a.client_id,
                              attended: true,
                              arrivalTime: e.target.value ? new Date(e.target.value).toISOString() : null,
                              departureTime: a.departure_time,
                              activityNote: a.activity_note,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Departure</Label>
                        <Input
                          type="datetime-local"
                          defaultValue={a.departure_time?.slice(0, 16) ?? ""}
                          onBlur={(e) =>
                            attendanceM.mutate({
                              sessionId,
                              clientId: a.client_id,
                              attended: true,
                              arrivalTime: a.arrival_time,
                              departureTime: e.target.value ? new Date(e.target.value).toISOString() : null,
                              activityNote: a.activity_note,
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs">Activity note</Label>
                        <Input
                          defaultValue={a.activity_note ?? ""}
                          onBlur={(e) =>
                            attendanceM.mutate({
                              sessionId,
                              clientId: a.client_id,
                              attended: true,
                              arrivalTime: a.arrival_time,
                              departureTime: a.departure_time,
                              activityNote: e.target.value || null,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                  {a.attended && (
                    <div className="text-xs text-muted-foreground">
                      Billed: {a.billed_units ?? 0} {a.billed_mode === "qtr_hr" ? "qtr-hr units" : "daily unit"}
                      {a.billed_rate != null && <> @ ${Number(a.billed_rate).toFixed(2)}</>}
                      {a.cap_snapshot != null && <> (cap ${Number(a.cap_snapshot).toFixed(2)})</>}
                      {a.billed_rate == null && (
                        <span className="text-destructive ml-2">
                          No client-authorized rate for {a.billed_code} — won't bill.
                        </span>
                      )}
                      {a.billed_rate != null && a.cap_snapshot != null && Number(a.billed_rate) > Number(a.cap_snapshot) && (
                        <span className="text-destructive ml-2">Rate exceeds cap.</span>
                      )}
                    </div>
                  )}

                  {/* Transport (MTP) — only meaningful when this attendance is part of the day-program day */}
                  {a.attended && session && session.service_code !== "DSI" && (
                    <div className="border-t pt-2 mt-2 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Truck className="h-4 w-4" /> Transport (MTP — flat ${MTP_FLAT_RATE.toFixed(2)})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Input
                          placeholder="Pickup location"
                          defaultValue={transport?.pickup_location ?? ""}
                          onBlur={(e) =>
                            transportM.mutate({
                              attendanceId: a.id,
                              pickupLocation: e.target.value || null,
                              pickupTime: transport?.pickup_time ?? null,
                              dropoffLocation: transport?.dropoff_location ?? null,
                              dropoffTime: transport?.dropoff_time ?? null,
                            })
                          }
                        />
                        <Input
                          type="datetime-local"
                          defaultValue={transport?.pickup_time?.slice(0, 16) ?? ""}
                          onBlur={(e) =>
                            transportM.mutate({
                              attendanceId: a.id,
                              pickupLocation: transport?.pickup_location ?? null,
                              pickupTime: e.target.value ? new Date(e.target.value).toISOString() : null,
                              dropoffLocation: transport?.dropoff_location ?? null,
                              dropoffTime: transport?.dropoff_time ?? null,
                            })
                          }
                        />
                        <Input
                          placeholder="Drop-off location"
                          defaultValue={transport?.dropoff_location ?? ""}
                          onBlur={(e) =>
                            transportM.mutate({
                              attendanceId: a.id,
                              pickupLocation: transport?.pickup_location ?? null,
                              pickupTime: transport?.pickup_time ?? null,
                              dropoffLocation: e.target.value || null,
                              dropoffTime: transport?.dropoff_time ?? null,
                            })
                          }
                        />
                        <Input
                          type="datetime-local"
                          defaultValue={transport?.dropoff_time?.slice(0, 16) ?? ""}
                          onBlur={(e) =>
                            transportM.mutate({
                              attendanceId: a.id,
                              pickupLocation: transport?.pickup_location ?? null,
                              pickupTime: transport?.pickup_time ?? null,
                              dropoffLocation: transport?.dropoff_location ?? null,
                              dropoffTime: e.target.value ? new Date(e.target.value).toISOString() : null,
                            })
                          }
                        />
                      </div>
                      {transport && (
                        <div className="text-xs">
                          {transport.mtp_billed ? (
                            <Badge>MTP billable</Badge>
                          ) : (
                            <span className="text-amber-600">{transport.mtp_block_reason}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {a.attended && session?.service_code === "DSI" && (
                    <div className="text-xs text-amber-600">
                      MTP is not available on DSI sessions — transportation is bundled into DSI (SOW 13.1).
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <DialogFooter>
          <div className="text-xs text-muted-foreground mr-auto">
            Caps: DSG ${RATE_CAPS.DSG_DAILY} • DSP qtr-hr ${RATE_CAPS.DSP_QTR_HR} • DSP daily $
            {RATE_CAPS.DSP_DAILY_EXTENDED} • DSI 6h ${RATE_CAPS.DSI_TIER[5]} • MTP flat $
            {RATE_CAPS.MTP_FLAT}
          </div>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
