import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Settings2, AlertTriangle } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import { listAgreementsMatrix, type AgreementStatus, type MatrixCell } from "@/lib/agreements.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/hive-exec/agreements")({
  head: () => ({ meta: [{ title: "Agreements Matrix — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="agreements.read">
      <AgreementsMatrixPage />
    </RequireCapability>
  ),
});

function AgreementsMatrixPage() {
  const listFn = useServerFn(listAgreementsMatrix);
  const q = useQuery({ queryKey: ["exec-agreements-matrix"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<"all" | "attention">("attention");

  const sortedOrgs = useMemo(() => {
    if (!q.data) return [];
    const cellsByOrg = new Map<string, MatrixCell[]>();
    for (const c of q.data.cells) {
      const arr = cellsByOrg.get(c.organization_id) ?? [];
      arr.push(c);
      cellsByOrg.set(c.organization_id, arr);
    }
    const scored = q.data.organizations.map((o) => {
      const cells = cellsByOrg.get(o.id) ?? [];
      const score = cells.reduce((s, c) => s + (c.attention === "overdue" ? 2 : c.attention === "expiring_soon" ? 1 : 0), 0);
      return { org: o, cells, score };
    });
    const filtered = filter === "attention" ? scored.filter((s) => s.score > 0) : scored;
    return filtered.sort((a, b) => b.score - a.score || a.org.name.localeCompare(b.org.name));
  }, [q.data, filter]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">Agreements Matrix</h1>
          <p className="text-sm text-muted-foreground">Per-organization compliance paperwork. Contracts &amp; status only — no client data.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "attention" ? "default" : "outline"} onClick={() => setFilter("attention")}>
            <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Attention only
          </Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All orgs</Button>
          <Link to="/dashboard/hive-exec/agreements/requirements" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted">
            <Settings2 className="h-3.5 w-3.5" /> Master checklist
          </Link>
        </div>
      </header>

      {q.isLoading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>}

      {q.data && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/40 p-2">Organization</th>
                {q.data.requirements.map((r) => (
                  <th key={r.id} className="p-2 font-medium">{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedOrgs.map(({ org, cells }) => (
                <tr key={org.id} className="border-t border-border">
                  <td className="sticky left-0 z-10 bg-card p-2 font-medium">
                    <Link to="/dashboard/hive-exec/agreements/$orgId" params={{ orgId: org.id }} className="hover:underline">
                      {org.name}
                    </Link>
                  </td>
                  {q.data.requirements.map((r) => {
                    const cell = cells.find((c) => c.requirement_id === r.id);
                    return (
                      <td key={r.id} className="p-2">
                        <StatusChip status={cell?.status ?? "missing"} attention={cell?.attention ?? null} />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {sortedOrgs.length === 0 && (
                <tr>
                  <td colSpan={q.data.requirements.length + 1} className="p-8 text-center text-sm text-muted-foreground">
                    <FileSignature className="mx-auto mb-2 h-5 w-5" />
                    {filter === "attention" ? "Nothing requires attention." : "No organizations yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status, attention }: { status: AgreementStatus | "missing"; attention: MatrixCell["attention"] }) {
  const label = status === "missing" ? "Not started" : status.replace("_", " ");
  let cls = "bg-muted text-muted-foreground";
  if (attention === "overdue") cls = "bg-[#fecaca] text-[#7f1d1d]";
  else if (attention === "expiring_soon") cls = "bg-[#fef3c7] text-[#78350f]";
  else if (status === "signed") cls = "bg-[#dcfce7] text-[#166534]";
  else if (status === "sent") cls = "bg-[#dbeafe] text-[#1e40af]";
  else if (status === "expired") cls = "bg-[#fecaca] text-[#7f1d1d]";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] capitalize ${cls}`}>{label}</span>;
}
