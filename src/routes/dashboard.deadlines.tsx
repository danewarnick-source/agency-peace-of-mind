import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { AlarmClock, AlertTriangle, Clock, ShieldCheck, FileSignature, Activity, ExternalLink, Home } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeadlines, type DeadlineItem } from "@/hooks/use-deadlines";
import { useCurrentOrg } from "@/hooks/use-org";
import { attestSummaryUpiEntered } from "@/lib/progress-summaries.functions";

const searchSchema = z.object({ client: z.string().uuid().optional() });

export const Route = createFileRoute("/dashboard/deadlines")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Deadlines — HIVE" }] }),
  component: DeadlinesPage,
});

const sourceIcon: Record<DeadlineItem["source"], typeof AlarmClock> = {
  summary: FileSignature,
  host_home_cert: Home,
  staff_cert: ShieldCheck,
  incident: Activity,
  billing_code: AlarmClock,
  sow_perimeter: ShieldCheck,
  pcsp_support_strategies: FileSignature,
  hrc_restriction_review: ShieldCheck,
};

const sourceLabel: Record<DeadlineItem["source"], string> = {
  summary: "Progress summary",
  host_home_cert: "Host home certification",
  staff_cert: "Staff certification",
  incident: "Incident clock",
  billing_code: "Billing-code deliverable",
  sow_perimeter: "SOW perimeter",
  pcsp_support_strategies: "Support Strategies renewal",
};

function fmtDue(d: Date): string {
  const now = Date.now();
  const ms = d.getTime() - now;
  const days = Math.round(ms / 86_400_000);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (ms < 0) {
    const od = Math.abs(days);
    return `${date} · ${od}d overdue`;
  }
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  return `${date} · in ${days}d`;
}

function DeadlinesPage() {
  const { overdue, dueSoon, upcoming, isLoading } = useDeadlines();
  const [showUpcoming, setShowUpcoming] = useState(false);
  const { client: selectedClient } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/deadlines" });

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of [...overdue, ...dueSoon, ...upcoming]) {
      if (it.subjectKind === "client" && it.clientId && !seen.has(it.clientId)) {
        seen.set(it.clientId, it.subject);
      }
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [overdue, dueSoon, upcoming]);

  const applyFilter = (items: DeadlineItem[]) =>
    selectedClient ? items.filter((i) => i.clientId === selectedClient) : items;

  const overdueF = applyFilter(overdue);
  const dueSoonF = applyFilter(dueSoon);
  const upcomingF = applyFilter(upcoming);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlarmClock className="h-6 w-6 text-[#137182]" />
            Deadlines
          </h1>
          <p className="text-sm text-muted-foreground">
            One view of every compliance clock for your agency — what's late, what's due this week.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="client-filter">
            Client
          </label>
          <select
            id="client-filter"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedClient ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              navigate({ search: (prev: { client?: string }) => ({ ...prev, client: v ? v : undefined }) });
            }}
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Overdue strip */}
      <Card className="border-rose-300 bg-rose-50/60 dark:border-rose-900/60 dark:bg-rose-950/20">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-rose-800 dark:text-rose-200">
            <AlertTriangle className="h-5 w-5" />
            Overdue ({overdueF.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : overdueF.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is overdue right now. Stay sharp.</p>
          ) : (
            <ItemList items={overdueF} tone="overdue" />
          )}
        </CardContent>
      </Card>

      {/* Due soon */}
      <Card className="border-amber-300/70 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
            <Clock className="h-5 w-5" />
            Due this week ({dueSoonF.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : dueSoonF.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due in the next 7 days.</p>
          ) : (
            <ItemList items={dueSoonF} tone="due_soon" />
          )}
        </CardContent>
      </Card>

      {/* Upcoming */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Upcoming (next 30 days) — {upcomingF.length}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowUpcoming((v) => !v)}>
            {showUpcoming ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showUpcoming && (
          <CardContent>
            {upcomingF.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in the next 30 days.</p>
            ) : (
              <ItemList items={upcomingF.filter((i) => i.dueAt.getTime() - Date.now() <= 30 * 86_400_000)} tone="upcoming" />
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function ItemList({ items, tone }: { items: DeadlineItem[]; tone: DeadlineItem["status"] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <DeadlineRow key={item.key} item={item} tone={tone} />
      ))}
    </ul>
  );
}

function DeadlineRow({ item, tone }: { item: DeadlineItem; tone: DeadlineItem["status"] }) {
  const Icon = sourceIcon[item.source];
  const toneText =
    tone === "overdue"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "due_soon"
        ? "text-amber-700 dark:text-amber-200"
        : "text-muted-foreground";

  return (
    <li className="flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneText}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {item.href ? (
              <a href={item.href} className="hover:underline hover:text-[#137182]">
                {item.title}
              </a>
            ) : (
              item.title
            )}
            {item.source === "summary" && item.summary?.requires_upi_attestation && (
              <Badge className="ml-2 bg-[#137182] text-white hover:bg-[#137182]">SEI — Monthly UPI submission required</Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {sourceLabel[item.source]} · {item.subject}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-xs font-mono ${toneText}`}>{fmtDue(item.dueAt)}</span>
        <RowAction item={item} />
      </div>
    </li>
  );
}

function RowAction({ item }: { item: DeadlineItem }) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const attestFn = useServerFn(attestSummaryUpiEntered);

  const attest = useMutation({
    mutationFn: async () =>
      attestFn({ data: { organizationId: org!.organization_id, summaryId: item.summary!.id } }),
    onSuccess: () => {
      toast.success("Attested — entered into UPI.");
      qc.invalidateQueries({ queryKey: ["deadlines"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Summary rows: completion happens in the Summaries portal (single source of
  // truth). Always render "Open summary"; for SEI / UPI-required summaries
  // that have been finalized but still need the state UPI entry, also show
  // the "Entered into UPI" attestation button.
  if (item.source === "summary" && item.summary) {
    const s = item.summary;
    const needsUpi =
      !!s.requires_upi_attestation && !!s.finalized_at && !s.upi_entered_at;
    return (
      <div className="flex items-center gap-2">
        {item.href && (
          <Button asChild size="sm" variant="outline">
            <a href={item.href}>
              Open summary <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </Button>
        )}
        {needsUpi && (
          <Button size="sm" disabled={attest.isPending || !org}
            onClick={() => attest.mutate()}>
            Entered into UPI
          </Button>
        )}
      </div>
    );
  }

  if (item.href) {
    return (
      <Button asChild size="sm" variant="outline">
        <a href={item.href}>
          Open <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      </Button>
    );
  }
  return null;
}


/** Compact card for the Home dashboard. */
export function DeadlinesHomeCard() {
  const { overdue, dueSoon, isLoading } = useDeadlines();
  const counts = useMemo(() => ({ overdue: overdue.length, dueSoon: dueSoon.length }), [overdue, dueSoon]);
  return (
    <Link to="/dashboard/deadlines" className="block">
      <Card className="transition hover:border-[#137182]/40 hover:shadow-[var(--shadow-card)]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <AlarmClock className="h-4 w-4 text-[#137182]" />
            Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-6">
            <div>
              <div className={`text-2xl font-bold ${counts.overdue > 0 ? "text-rose-600" : "text-foreground"}`}>
                {isLoading ? "—" : counts.overdue}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Overdue</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${counts.dueSoon > 0 ? "text-amber-600" : "text-foreground"}`}>
                {isLoading ? "—" : counts.dueSoon}
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Due this week</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
