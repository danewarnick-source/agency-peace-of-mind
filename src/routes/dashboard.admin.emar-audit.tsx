import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ShieldAlert } from "lucide-react";
import { type EmarStatus, normalizeEmarStatus, EMAR_STATUS_LABELS } from "@/lib/emar-status";

export const Route = createFileRoute("/dashboard/admin/emar-audit")({
  head: () => ({ meta: [{ title: "eMAR Audit — HIVE" }] }),
  component: () => (
    <RequirePermission perm="manage_users">
      <AuditPage />
    </RequirePermission>
  ),
});

type Row = {
  id: string; client_id: string; medication_id: string;
  scheduled_for: string; administered_at: string | null;
  status: EmarStatus;
  exception_reason: string | null; notes: string | null;
  staff_id: string | null; staff_name: string | null; signature_attestation: string | null;
  client_name?: string; medication_name?: string; dosage?: string | null; team_name?: string | null;
};

const STATUS_COLOR: Record<EmarStatus, string> = {
  self_administered: "bg-emerald-100 text-emerald-800",
  refused: "bg-rose-100 text-rose-800",
  omitted: "bg-rose-100 text-rose-800",
  missed: "bg-amber-100 text-amber-800",
  loa: "bg-blue-100 text-blue-800",
};

function AuditPage() {
  const { data: org } = useCurrentOrg();
  const [filter, setFilter] = useState<"all" | "refused" | "missed">("all");
  const [staffFilter, setStaffFilter] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["emar-audit", org?.organization_id],
    queryFn: async (): Promise<Row[]> => {
      const [{ data: logs }, { data: clients }, { data: meds }, { data: teams }] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from("emar_logs" as any).select("*").eq("organization_id", org!.organization_id).order("scheduled_for", { ascending: false }).limit(2000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from("clients").select("id, first_name, last_name, team_id").eq("organization_id", org!.organization_id) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from("client_medications" as any).select("id, medication_name, dosage").eq("organization_id", org!.organization_id),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from("teams" as any).select("id, team_name").eq("organization_id", org!.organization_id),
      ]);
      const clientMap = new Map<string, { id: string; first_name: string; last_name: string; team_id: string | null }>(
        ((clients ?? []) as unknown as Array<{ id: string; first_name: string; last_name: string; team_id: string | null }>).map((c) => [c.id, c])
      );
      const medMap = new Map((meds as unknown as Array<{ id: string; medication_name: string; dosage: string | null }> ?? []).map((m) => [m.id, m]));
      const teamMap = new Map((teams as unknown as Array<{ id: string; team_name: string }> ?? []).map((t) => [t.id, t.team_name]));
      return ((logs ?? []) as unknown as Array<Omit<Row, "status"> & { status: string }>).map((l) => {
        const c = clientMap.get(l.client_id);
        const m = medMap.get(l.medication_id);
        return {
          ...l,
          status: normalizeEmarStatus(l.status),
          client_name: c ? `${c.first_name} ${c.last_name}` : "—",
          medication_name: m?.medication_name ?? "—",
          dosage: m?.dosage ?? null,
          team_name: c?.team_id ? teamMap.get(c.team_id) ?? null : null,
        } as Row;
      });
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "refused" && r.status !== "refused" && r.status !== "omitted") return false;
      if (filter === "missed" && r.status !== "missed") return false;
      if (staffFilter && !(r.staff_name ?? "").toLowerCase().includes(staffFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, filter, staffFilter]);

  const counts = useMemo(() => ({
    total: rows.length,
    refused: rows.filter((r) => r.status === "refused" || r.status === "omitted").length,
    missed: rows.filter((r) => r.status === "missed").length,
  }), [rows]);

  const exportCsv = () => {
    const headers = ["Scheduled","Administered","Status","Client","Facility","Medication","Dosage","Staff","Reason","Notes","Signature"];
    const lines = [headers.join(",")];
    filtered.forEach((r) => {
      lines.push([
        r.scheduled_for, r.administered_at ?? "", r.status, r.client_name, r.team_name ?? "",
        r.medication_name, r.dosage ?? "", r.staff_name ?? "", r.exception_reason ?? "",
        (r.notes ?? "").replace(/"/g, '""'), (r.signature_attestation ?? "").replace(/"/g, '""'),
      ].map((v) => `"${String(v).replace(/\n/g, " ")}"`).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `emar-audit-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" /> Master eMAR Audit Desk
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Full agency MAR ledger for compliance officers and state license reviews.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="mr-1.5 h-3.5 w-3.5" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Total entries</div><div className="text-2xl font-bold">{counts.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Refusals / Omitted</div><div className="text-2xl font-bold text-rose-600">{counts.refused}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Missed</div><div className="text-2xl font-bold text-amber-600">{counts.missed}</div></Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        <Button size="sm" variant={filter === "refused" ? "default" : "outline"} onClick={() => setFilter("refused")}>🛑 Show All Refusals</Button>
        <Button size="sm" variant={filter === "missed" ? "default" : "outline"} onClick={() => setFilter("missed")}>⏰ Show Missed Meds</Button>
        <Input
          placeholder="Filter by Staff Member"
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !filtered.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No matching entries.</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-card z-10">
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Facility</TableHead>
                  <TableHead>Medication / Dose</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Staff</TableHead>
                  <TableHead>Reason / Notes</TableHead>
                  <TableHead>Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell><Badge className={STATUS_COLOR[r.status]}>{EMAR_STATUS_LABELS[r.status]}</Badge></TableCell>
                    <TableCell className="font-medium">{r.client_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.team_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.medication_name}{r.dosage && ` · ${r.dosage}`}</TableCell>
                    <TableCell className="text-xs font-mono">{new Date(r.scheduled_for).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{r.administered_at ? new Date(r.administered_at).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs">{r.staff_name ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-[260px]">
                      {r.exception_reason && <div className="font-medium">{r.exception_reason}</div>}
                      {r.notes && <div className="text-muted-foreground line-clamp-2">{r.notes}</div>}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground max-w-[200px] truncate" title={r.signature_attestation ?? ""}>
                      {r.signature_attestation ? `${r.signature_attestation.slice(0, 30)}…` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
