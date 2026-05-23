import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RequirePermission } from "@/components/rbac-guard";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Download, Loader2, ShieldCheck, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/evv-compliance")({
  head: () => ({ meta: [{ title: "EVV Compliance Review — Care Academy" }] }),
  component: () => (
    <RequirePermission perm="export_reports">
      <EvvCompliancePage />
    </RequirePermission>
  ),
});

type ShiftRow = {
  id: string;
  user_id: string;
  client_id: string | null;
  clock_in_time: string | null;
  clock_out_time: string | null;
  clock_in_lat: number | null;
  clock_in_long: number | null;
  clock_out_lat: number | null;
  clock_out_long: number | null;
  outside_geofence: boolean;
  device_fingerprint: string | null;
  status: string;
  profiles: { full_name: string | null; email: string | null } | null;
  clients: { first_name: string | null; last_name: string | null } | null;
  shift_notes: { goals_addressed: string[] | null; narrative_summary: string | null }[] | null;
};

const HEADERS = [
  "Shift ID", "Employee Name", "Client Name", "Date", "Clock In Time", "Clock Out Time",
  "Total Hours Worked", "In Coordinates", "Out Coordinates", "Geofence Status",
  "Device Fingerprint", "Goals Addressed", "Daily Shift Note Narrative", "Approval Status",
];

function fmtDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
}
function hours(inIso: string | null, outIso: string | null) {
  if (!inIso || !outIso) return "—";
  const diffMs = new Date(outIso).getTime() - new Date(inIso).getTime();
  if (!isFinite(diffMs) || diffMs <= 0) return "0.00";
  return (diffMs / 3600000).toFixed(2);
}
function coords(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return "";
  return `${lat}, ${lng}`;
}
function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function employeeName(r: ShiftRow) {
  return r.profiles?.full_name || r.profiles?.email || "—";
}
function clientName(r: ShiftRow) {
  return r.clients ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim() || "—" : "—";
}

function EvvCompliancePage() {
  const { data: org } = useCurrentOrg();
  const [loading, setLoading] = useState(false);

  const selectStr = `id, user_id, client_id, clock_in_time, clock_out_time,
       clock_in_lat, clock_in_long, clock_out_lat, clock_out_long,
       outside_geofence, device_fingerprint, status,
       profiles:user_id ( full_name, email ),
       clients:client_id ( first_name, last_name ),
       shift_notes ( goals_addressed, narrative_summary )`;

  const { data: pending } = useQuery({
    enabled: !!org,
    queryKey: ["evv-pending", org?.organization_id],
    queryFn: async (): Promise<ShiftRow[]> => {
      const { data, error } = await supabase
        .from("shifts")
        .select(selectStr)
        .eq("organization_id", org!.organization_id)
        .eq("status", "pending_approval")
        .order("clock_in_time", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ShiftRow[];
    },
  });

  const exportCsv = async () => {
    if (!org) return toast.error("No organization context");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shifts")
        .select(selectStr)
        .eq("organization_id", org.organization_id)
        .order("clock_in_time", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as ShiftRow[];

      const csvRows = [HEADERS.join(",")];
      for (const r of rows) {
        const note = r.shift_notes?.[0];
        const geofence = r.outside_geofence ? "FLAGGED - Outside Geofence" : "PASS - On-Site";
        const row = [
          r.id, employeeName(r), clientName(r), fmtDate(r.clock_in_time),
          fmtTime(r.clock_in_time), fmtTime(r.clock_out_time),
          hours(r.clock_in_time, r.clock_out_time),
          coords(r.clock_in_lat, r.clock_in_long),
          coords(r.clock_out_lat, r.clock_out_long),
          geofence, r.device_fingerprint ?? "",
          (note?.goals_addressed ?? []).join("; "),
          note?.narrative_summary ?? "", r.status,
        ].map(csvEscape).join(",");
        csvRows.push(row);
      }

      const csv = "\ufeff" + csvRows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const today = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `utah_evv_compliance_audit_report_${today}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`Exported ${rows.length} shift record${rows.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to export report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold">EVV Compliance Review</h2>
            <p className="text-sm text-muted-foreground">
              Review pending shift documentation and export tamper-evident audit logs.
            </p>
          </div>
        </div>
        <Button onClick={exportCsv} disabled={loading} className="shrink-0">
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compiling…</>
            : <><Download className="mr-2 h-4 w-4" /> Export Audit Report (.CSV)</>}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="text-base font-semibold">Pending approval queue</h3>
            <p className="text-xs text-muted-foreground">
              Click a row to view PCSP goals addressed and narrative summary.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{pending?.length ?? 0} shifts awaiting review</span>
        </div>

        {!pending?.length ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No shifts pending approval.
          </p>
        ) : (
          <Accordion type="multiple" className="space-y-2">
            {pending.map((r) => {
              const note = r.shift_notes?.[0];
              const flagged = r.outside_geofence;
              return (
                <AccordionItem
                  key={r.id}
                  value={r.id}
                  className={`overflow-hidden rounded-lg border ${
                    flagged
                      ? "border-orange-300/60 bg-orange-50/60 dark:border-orange-500/30 dark:bg-orange-500/10"
                      : "border-border bg-background"
                  }`}
                >
                  <AccordionTrigger className="px-4 py-3 text-left hover:no-underline">
                    <div className="grid w-full grid-cols-[1fr_1fr_120px_120px_auto] items-center gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{employeeName(r)}</p>
                        <p className="truncate text-xs text-muted-foreground">{clientName(r)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">{fmtDate(r.clock_in_time)} · {fmtTime(r.clock_in_time)} → {fmtTime(r.clock_out_time)}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">{hours(r.clock_in_time, r.clock_out_time)} hrs</p>
                      <div>
                        {flagged ? (
                          <Badge variant="outline" className="border-orange-400 text-orange-700 dark:text-orange-300">
                            <AlertTriangle className="mr-1 h-3 w-3" /> Outside geofence
                          </Badge>
                        ) : (
                          <Badge variant="secondary"><MapPin className="mr-1 h-3 w-3" /> On-site</Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="capitalize">{r.status.replace("_", " ")}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="grid gap-4 rounded-lg border border-border bg-card p-4">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">PCSP goals addressed</p>
                        {note?.goals_addressed?.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {note.goals_addressed.map((g) => (
                              <label key={g} className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs">
                                <input type="checkbox" checked readOnly className="h-3 w-3 accent-primary" />
                                {g}
                              </label>
                            ))}
                          </div>
                        ) : <p className="text-xs text-muted-foreground">No goals recorded.</p>}
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Narrative summary</p>
                        <p className="whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 text-sm leading-relaxed">
                          {note?.narrative_summary || "No narrative on file."}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                        <p><span className="font-medium text-foreground">Clock-in GPS:</span> {coords(r.clock_in_lat, r.clock_in_long) || "—"}</p>
                        <p><span className="font-medium text-foreground">Clock-out GPS:</span> {coords(r.clock_out_lat, r.clock_out_long) || "—"}</p>
                        <p className="col-span-2 truncate"><span className="font-medium text-foreground">Device fingerprint:</span> {r.device_fingerprint || "—"}</p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </div>
  );
}
