import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listPendingHiveApprovals,
  type ApprovalRequestRow,
} from "@/lib/billing-approvals.functions";
import { ApprovalDialog } from "@/components/billing/ApprovalDialog";

export const Route = createFileRoute("/dashboard/hive-exec/billing-approvals")({
  head: () => ({ meta: [{ title: "HIVE — Billing Code Approvals" }] }),
  component: BillingApprovalsPage,
});

function BillingApprovalsPage() {
  const [tab, setTab] = useState<"pending" | "resolved" | "all">("pending");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [openOrgId, setOpenOrgId] = useState<string | null>(null);

  const listFn = useServerFn(listPendingHiveApprovals);
  const listQ = useQuery({
    queryKey: ["hive-approvals", tab],
    queryFn: () => listFn({ data: { status: tab } }),
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const data = listQ.data ?? [];
    if (!term) return data;
    return data.filter((r) =>
      [r.code, r.organization_name, r.provider_name_on_pcsp, r.requesting_user_name, r.justification]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [listQ.data, q]);

  const pendingTotal = (listQ.data ?? []).filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Billing Approval Tickets</h2>
            <p className="text-xs text-muted-foreground">
              Incoming tickets from providers requesting permission to bill an outside-provider code from a PCSP.
              Open a ticket to converse with the provider; a ticket resolves when you sign an Approve or Deny.
            </p>
          </div>
          {tab === "pending" && pendingTotal > 0 && (
            <Badge variant="outline" className="ml-auto border-amber-500/60 text-amber-700">
              {pendingTotal} open ticket{pendingTotal === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="resolved">Resolved</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, org, provider…" className="h-8 pl-7 text-xs w-64" />
            </div>
          </div>

          <TabsContent value={tab}>
            {listQ.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nothing here.</div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r) => (
                  <ApprovalRow
                    key={r.id}
                    r={r}
                    onOpen={() => { setOpenOrgId(r.organization_id); setOpenId(r.id); }}
                  />
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {openId && openOrgId && (
        <ApprovalDialog
          open={!!openId}
          onOpenChange={(o) => { if (!o) { setOpenId(null); setOpenOrgId(null); } }}
          organizationId={openOrgId}
          requestId={openId}
        />
      )}
    </div>
  );
}

function ApprovalRow({ r, onOpen }: { r: ApprovalRequestRow; onOpen: () => void }) {
  const status = r.status;
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-[10px] text-muted-foreground">#{String(r.id).slice(0, 8)}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{r.code}</span>
          <span className="font-semibold">{r.organization_name}</span>
          <span className="text-xs text-muted-foreground">
            opened by {r.requesting_user_name} · {new Date(r.created_at).toLocaleDateString()}
          </span>
          {r.unread_for_me > 0 && (
            <Badge variant="destructive" className="text-[10px]">{r.unread_for_me} new</Badge>
          )}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Provider on PCSP: <span className="font-medium text-foreground">{r.provider_name_on_pcsp || "unspecified"}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-xs">{r.justification}</div>
        {r.resolved_at && r.resolved_signature_name && (
          <div className="mt-1 text-[11px] text-muted-foreground">
            Signed by {r.resolved_signature_name} · {new Date(r.resolved_signature_at ?? r.resolved_at).toLocaleString()}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        {status === "pending" && <Badge variant="outline" className="border-amber-500/60 text-amber-700">Open ticket</Badge>}
        {status === "approved" && <Badge variant="outline" className="border-emerald-500/60 text-emerald-700">Resolved · Approved</Badge>}
        {status === "denied" && <Badge variant="outline" className="border-destructive/60 text-destructive">Resolved · Denied</Badge>}
        {status === "withdrawn" && <Badge variant="outline" className="text-muted-foreground">Withdrawn</Badge>}
        <Button size="sm" variant="outline" onClick={onOpen}>
          {status === "pending" ? "Open & respond" : "View thread"}
        </Button>
      </div>
    </li>
  );
}

