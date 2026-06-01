import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import { listAllTickets, updateTicket } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/tickets")({
  component: TicketsPage,
});

const STATUS_OPTS = ["submitted", "in_progress", "waiting_customer", "resolved", "closed"];

function TicketsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAllTickets);
  const updFn = useServerFn(updateTicket);
  const ticketsQ = useQuery({ queryKey: ["hive-exec-tickets"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<string>("open");

  const upd = useMutation({
    mutationFn: (vars: { ticketId: string; status: string }) =>
      updFn({ data: { ticketId: vars.ticketId, patch: { status: vars.status } } }),
    onSuccess: () => {
      toast.success("Ticket updated");
      qc.invalidateQueries({ queryKey: ["hive-exec-tickets"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-kpis"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const tickets = (ticketsQ.data ?? []).filter((t) => {
    if (filter === "all") return true;
    if (filter === "open") return ["submitted", "in_progress", "waiting_customer"].includes(t.status);
    return t.status === filter;
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <LifeBuoy className="h-4 w-4 text-[#d97a1c]" /> Support queue
        </h2>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="min-h-[44px] rounded-md border border-border bg-background px-2 text-sm"
        >
          <option value="open">Open</option>
          <option value="all">All</option>
          {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {ticketsQ.isLoading ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading tickets…</td></tr>
            ) : tickets.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No tickets match.</td></tr>
            ) : tickets.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <Link
                    to="/dashboard/hive-exec/$orgId"
                    params={{ orgId: t.organization_id }}
                    className="text-[#0f1b3d] hover:underline"
                  >
                    {t.organization_name}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{t.subject}</div>
                  {t.body && <div className="line-clamp-1 text-xs text-muted-foreground">{t.body}</div>}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.source}</td>
                <td className="px-3 py-2 text-xs">{t.severity}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <select
                    value={t.status}
                    onChange={(e) => upd.mutate({ ticketId: t.id, status: e.target.value })}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
