import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Check, Pencil, MapPin, Clock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EVV_SERVICE_CODES, evvServiceLabel } from "@/lib/evv-codes";

export const Route = createFileRoute("/dashboard/compliance-desk")({
  head: () => ({ meta: [{ title: "Compliance Desk — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <ComplianceDeskPage />
    </RequirePermission>
  ),
});

type Coord = { latitude: number; longitude: number; accuracy_meters: number };
type Row = {
  id: string;
  staff_id: string;
  client_id: string;
  utah_medicaid_member_id: string;
  service_type_code: string;
  shift_entry_type: "Client_Profile_Pass" | "General_Sidebar_Unscheduled";
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  gps_in_coordinates: Coord;
  gps_out_coordinates: Coord | null;
  clients: { first_name: string; last_name: string; physical_address: string | null } | null;
  staff: { full_name: string | null; email: string | null } | null;
};

function fmtDuration(inIso: string, outIso: string | null) {
  if (!outIso) return "—";
  const ms = new Date(outIso).getTime() - new Date(inIso).getTime();
  const m = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function ComplianceDeskPage() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"timesheets">("timesheets");
  const [mapOpen, setMapOpen] = useState<Row | null>(null);
  const [editRow, setEditRow] = useState<Row | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["evv-pending", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, staff_id, client_id, utah_medicaid_member_id, service_type_code, shift_entry_type, clock_in_timestamp, clock_out_timestamp, gps_in_coordinates, gps_out_coordinates, clients(first_name,last_name,physical_address)")
        .eq("organization_id", org!.organization_id)
        .eq("status", "Pending")
        .order("clock_in_timestamp", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as unknown as Row[];
      // Fetch staff names in one round-trip.
      const ids = Array.from(new Set(list.map((r) => r.staff_id)));
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const map = new Map((profiles ?? []).map((p) => [p.id, p]));
        list.forEach((r) => {
          const p = map.get(r.staff_id);
          r.staff = p ? { full_name: p.full_name, email: p.email } : null;
        });
      }
      return list;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("evv_timesheets").update({ status: "Approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift approved.");
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Compliance Desk</h1>
        <p className="text-sm text-muted-foreground">
          Approve EVV shifts, audit GPS punches, and reconcile Medicaid billing entries.
        </p>
      </header>

      {/* Sub-navigation */}
      <nav className="inline-flex rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setTab("timesheets")}
          className={`rounded-md px-4 py-2 text-sm font-medium transition ${tab === "timesheets" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          ⏳ Timesheets
        </button>
      </nav>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pending EVV Shifts
          </h2>
          <Badge variant="outline" className="font-mono text-[10px]">{rows.length} pending</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Caregiver</TableHead>
                <TableHead>Target Client / House</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">No pending shifts. ✓</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.staff?.full_name ?? r.staff?.email ?? "—"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{r.clients?.first_name} {r.clients?.last_name}</div>
                      <div className="text-[11px] text-muted-foreground">{r.clients?.physical_address ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.shift_entry_type === "Client_Profile_Pass" ? "default" : "secondary"}>
                        {r.shift_entry_type === "Client_Profile_Pass" ? "In-Chart" : "Sidebar Unscheduled"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.utah_medicaid_member_id}</TableCell>
                    <TableCell><Badge variant="outline" className="font-mono">{r.service_type_code}</Badge></TableCell>
                    <TableCell className="font-mono text-xs"><Clock className="mr-1 inline h-3 w-3" />{fmtDuration(r.clock_in_timestamp, r.clock_out_timestamp)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setMapOpen(r)}>
                        <MapPin className="mr-1 h-3 w-3" /> View
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="icon"
                          className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                          onClick={() => approve.mutate(r.id)}
                          disabled={approve.isPending}
                          aria-label="Approve"
                        >
                          {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          className="h-8 w-8"
                          onClick={() => setEditRow(r)}
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <GpsMatchDialog row={mapOpen} onClose={() => setMapOpen(null)} />
      <EditShiftDialog row={editRow} onClose={() => setEditRow(null)} />
    </div>
  );
}

function GpsMatchDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const link = useMemo(() => {
    if (!row) return "";
    const a = row.gps_in_coordinates;
    const b = row.gps_out_coordinates;
    if (!a) return "";
    if (!b) return `https://www.openstreetmap.org/?mlat=${a.latitude}&mlon=${a.longitude}#map=17/${a.latitude}/${a.longitude}`;
    return `https://www.openstreetmap.org/?bbox=${Math.min(a.longitude,b.longitude)},${Math.min(a.latitude,b.latitude)},${Math.max(a.longitude,b.longitude)},${Math.max(a.latitude,b.latitude)}`;
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>📍 GPS Map Match</DialogTitle>
          <DialogDescription>Precise punch-in vs punch-out coordinates.</DialogDescription>
        </DialogHeader>
        {row && (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <div className="font-semibold text-emerald-600">Clock-In</div>
              <div className="font-mono text-xs">
                {row.gps_in_coordinates.latitude.toFixed(6)}, {row.gps_in_coordinates.longitude.toFixed(6)}
                <span className="ml-2 text-muted-foreground">± {Math.round(row.gps_in_coordinates.accuracy_meters)}m</span>
              </div>
              <div className="text-[11px] text-muted-foreground">{new Date(row.clock_in_timestamp).toLocaleString()}</div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="font-semibold text-rose-600">Clock-Out</div>
              {row.gps_out_coordinates ? (
                <>
                  <div className="font-mono text-xs">
                    {row.gps_out_coordinates.latitude.toFixed(6)}, {row.gps_out_coordinates.longitude.toFixed(6)}
                    <span className="ml-2 text-muted-foreground">± {Math.round(row.gps_out_coordinates.accuracy_meters)}m</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{row.clock_out_timestamp ? new Date(row.clock_out_timestamp).toLocaleString() : ""}</div>
                </>
              ) : <div className="text-xs text-muted-foreground">Not captured</div>}
            </div>
            {link && <Button asChild variant="outline" className="w-full"><a href={link} target="_blank" rel="noreferrer">Open in OpenStreetMap</a></Button>}
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditShiftDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [svc, setSvc] = useState("");

  useMemo(() => {
    if (row) {
      setClockIn(row.clock_in_timestamp.slice(0, 16));
      setClockOut(row.clock_out_timestamp ? row.clock_out_timestamp.slice(0, 16) : "");
      setSvc(row.service_type_code);
    }
  }, [row]);

  const save = useMutation({
    mutationFn: async () => {
      if (!row) return;
      const { error } = await supabase
        .from("evv_timesheets")
        .update({
          clock_in_timestamp: new Date(clockIn).toISOString(),
          clock_out_timestamp: clockOut ? new Date(clockOut).toISOString() : null,
          service_type_code: svc,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Shift adjusted.");
      qc.invalidateQueries({ queryKey: ["evv-pending"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Adjustment</DialogTitle>
          <DialogDescription>Update the shift timestamps or service code before approval.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Clock-In</Label>
            <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div>
            <Label>Clock-Out</Label>
            <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div>
            <Label>Service Code</Label>
            <Select value={svc} onValueChange={setSvc}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                {EVV_SERVICE_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{evvServiceLabel(c.code)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
