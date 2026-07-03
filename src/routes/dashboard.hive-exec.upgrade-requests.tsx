import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, Check, X, Clock, Building2 } from "lucide-react";
import { listUpgradeRequests, resolveUpgradeRequest, type UpgradeRequestRow } from "@/lib/org-features.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/hive-exec/upgrade-requests")({
  head: () => ({ meta: [{ title: "Upgrade Requests — HIVE Executive" }] }),
  component: UpgradeRequestsPage,
});

function UpgradeRequestsPage() {
  const listFn = useServerFn(listUpgradeRequests);
  const resolveFn = useServerFn(resolveUpgradeRequest);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "approved" | "denied" | "all">("pending");

  const listQ = useQuery({
    queryKey: ["hive-exec-upgrade-requests", filter],
    queryFn: () => listFn({ data: { status: filter } }),
    refetchInterval: 30_000,
  });

  const resolveMut = useMutation({
    mutationFn: (args: { requestId: string; action: "grant" | "deny" }) => resolveFn({ data: args }),
    onSuccess: (_r, vars) => {
      toast.success(vars.action === "grant" ? "Feature granted" : "Request dismissed");
      qc.invalidateQueries({ queryKey: ["hive-exec-upgrade-requests"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-upgrade-pending-count"] });
      qc.invalidateQueries({ queryKey: ["org-features"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to resolve request"),
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#fff7ed] text-[#9a3412]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold">Feature Upgrade Requests</h2>
              <p className="text-sm text-muted-foreground">
                Organizations asking for access to gated features. Granting flips the same
                switch the Master Controller uses.
              </p>
            </div>
          </div>
          <div className="flex gap-1 rounded-md border border-border p-1">
            {(["pending", "approved", "denied", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`min-h-[36px] rounded px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  filter === f ? "bg-[#0f1b3d] text-white" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card shadow-sm">
        {listQ.isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No {filter === "all" ? "" : filter} upgrade requests.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <RequestRow
                key={r.id}
                row={r}
                onGrant={() => resolveMut.mutate({ requestId: r.id, action: "grant" })}
                onDeny={() => resolveMut.mutate({ requestId: r.id, action: "deny" })}
                busy={resolveMut.isPending}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function RequestRow({
  row,
  onGrant,
  onDeny,
  busy,
}: {
  row: UpgradeRequestRow;
  onGrant: () => void;
  onDeny: () => void;
  busy: boolean;
}) {
  const isPending = row.status === "pending";
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-[#0f1b3d]">{row.organization_name}</span>
          <StatusPill status={row.status} />
          {row.required_tier && (
            <span className="rounded bg-[#fff7ed] px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-[#9a3412]">
              {row.required_tier}
            </span>
          )}
        </div>
        <div className="text-sm text-foreground">
          Wants: <span className="font-medium">{row.feature_label}</span>{" "}
          <span className="text-xs text-muted-foreground">({row.feature_key})</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {new Date(row.created_at).toLocaleString()} · requested by{" "}
          {row.requested_by_name ?? row.requested_by.slice(0, 8)}
          {row.resolved_at && (
            <span> · resolved {new Date(row.resolved_at).toLocaleString()}</span>
          )}
        </div>
        {row.note && (
          <div className="mt-1 rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
            &ldquo;{row.note}&rdquo;
          </div>
        )}
      </div>
      {isPending && (
        <div className="flex gap-2 md:flex-shrink-0">
          <button
            onClick={onDeny}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <X className="h-4 w-4" /> Dismiss
          </button>
          <button
            onClick={onGrant}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Check className="h-4 w-4" /> Grant access
          </button>
        </div>
      )}
    </li>
  );
}

function StatusPill({ status }: { status: "pending" | "approved" | "denied" }) {
  const map = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-emerald-100 text-emerald-700",
    denied: "bg-gray-100 text-gray-600",
  }[status];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${map}`}>{status}</span>;
}
