import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { RequirePermission } from "@/components/rbac-guard";
import { Download, Loader2, ShieldCheck } from "lucide-react";
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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  if (!inIso || !outIso) return "";
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

function EvvCompliancePage() {
  const { data: org } = useCurrentOrg();
  const [loading, setLoading] = useState(false);

  const exportCsv = async () => {
    if (!org) return toast.error("No organization context");
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("shifts")
        .select(
          `id, user_id, client_id, clock_in_time, clock_out_time,
           clock_in_lat, clock_in_long, clock_out_lat, clock_out_long,
           outside_geofence, device_fingerprint, status,
           profiles:user_id ( full_name, email ),
           clients:client_id ( first_name, last_name ),
           shift_notes ( goals_addressed, narrative_summary )`
        )
        .eq("organization_id", org.organization_id)
        .order("clock_in_time", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as unknown as ShiftRow[];

      const csvRows = [HEADERS.join(",")];
      for (const r of rows) {
        const employee = r.profiles?.full_name || r.profiles?.email || "";
        const client = r.clients ? `${r.clients.first_name ?? ""} ${r.clients.last_name ?? ""}`.trim() : "";
        const note = r.shift_notes?.[0];
        const goals = (note?.goals_addressed ?? []).join("; ");
        const narrative = note?.narrative_summary ?? "";
        const geofence = r.outside_geofence ? "FLAGGED - Outside Geofence" : "PASS - On-Site";

        const row = [
          r.id, employee, client, fmtDate(r.clock_in_time),
          fmtTime(r.clock_in_time), fmtTime(r.clock_out_time),
          hours(r.clock_in_time, r.clock_out_time),
          coords(r.clock_in_lat, r.clock_in_long),
          coords(r.clock_out_lat, r.clock_out_long),
          geofence, r.device_fingerprint ?? "", goals, narrative, r.status,
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
      console.error(e);
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
              Export tamper-evident shift logs for state inspectors and DSPD audits.
            </p>
          </div>
        </div>
        <Button onClick={exportCsv} disabled={loading} className="shrink-0">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Compiling…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" /> Export EVV Compliance Report (.CSV)
            </>
          )}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
        <p className="font-medium text-foreground">What's included</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Shift ID, employee, client, date, clock-in/out time, total hours</li>
          <li>GPS coordinates at clock-in/out with geofence pass/flag status</li>
          <li>Device fingerprint for tamper-evident verification</li>
          <li>Goals addressed and full narrative shift note</li>
          <li>Approval status (pending / approved / rejected / flagged)</li>
        </ul>
      </div>
    </div>
  );
}
