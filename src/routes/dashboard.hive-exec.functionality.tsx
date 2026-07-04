import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Wrench, CheckCircle2, XCircle } from "lucide-react";
import { RequireCapability } from "@/hooks/use-exec-capability";
import {
  listFunctionalityReports,
  updateFunctionalityReport,
  type FunctionalityReport,
} from "@/lib/functionality-reports.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/hive-exec/functionality")({
  head: () => ({ meta: [{ title: "IT / Functionality — Executive Command Center" }] }),
  component: () => (
    <RequireCapability cap="support.manage">
      <FunctionalityPage />
    </RequireCapability>
  ),
});

function FunctionalityPage() {
  const listFn = useServerFn(listFunctionalityReports);
  const q = useQuery({ queryKey: ["functionality-reports"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<"open" | "all">("open");

  const items = (q.data ?? []).filter((r) => (filter === "open" ? r.status === "open" || r.status === "triaged" : true));

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold text-[#0f1b3d]">IT / Functionality Channel</h1>
          <p className="text-sm text-muted-foreground">
            Functionality reports from provider organizations. Technical context only — payloads strip client data.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Open</Button>
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
        </div>
      </header>

      {q.isLoading && <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">Loading…</div>}

      {!q.isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <Wrench className="mx-auto mb-2 h-5 w-5" />
          {filter === "open" ? "No open reports." : "No reports on file."}
        </div>
      )}

      <div className="space-y-2">
        {items.map((r) => (
          <ReportCard key={r.id} report={r} />
        ))}
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: FunctionalityReport }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateFunctionalityReport);
  const m = useMutation({
    mutationFn: (status: FunctionalityReport["status"]) => updateFn({ data: { id: report.id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["functionality-reports"] });
      toast.success("Updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const contextStr = JSON.stringify(report.technical_context, null, 2);
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            {report.organization_name ?? "Unknown org"} · {report.screen ?? "no screen"} · {new Date(report.created_at).toLocaleString()}
          </div>
          <p className="mt-1 text-sm">{report.description}</p>
        </div>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs capitalize">{report.status}</span>
      </header>
      {contextStr !== "{}" && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">{contextStr}</pre>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {report.status !== "triaged" && (
          <Button size="sm" variant="outline" onClick={() => m.mutate("triaged")} disabled={m.isPending}>
            Mark triaged
          </Button>
        )}
        <Button size="sm" onClick={() => m.mutate("resolved")} disabled={m.isPending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Resolved
        </Button>
        <Button size="sm" variant="ghost" onClick={() => m.mutate("dismissed")} disabled={m.isPending}>
          <XCircle className="mr-1 h-3.5 w-3.5" /> Dismiss
        </Button>
      </div>
    </article>
  );
}
