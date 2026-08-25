import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlarmClock,
  AlertTriangle,
  Clock,
  ShieldCheck,
  FileSignature,
  Activity,
  ExternalLink,
  ClipboardList,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDeadlines, type DeadlineItem, type DeadlineLane } from "@/hooks/use-deadlines";
import { useCurrentOrg } from "@/hooks/use-org";
import { attestSummaryUpiEntered } from "@/lib/progress-summaries.functions";

const searchSchema = z.object({
  client: z.string().uuid().optional(),
  lane: z.enum(["sow", "provider", "operational"]).optional(),
});

export const Route = createFileRoute("/dashboard/deadlines")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Deadlines — HIVE" }] }),
  component: DeadlinesPage,
});

const sourceIcon: Record<DeadlineItem["source"], typeof AlarmClock> = {
  summary: FileSignature,
  incident: Activity,
  hrc_restriction_review: ShieldCheck,
  company_obligation: ClipboardList,
};

const sourceLabel: Record<DeadlineItem["source"], string> = {
  summary: "Progress summary",
  incident: "Incident clock",
  hrc_restriction_review: "HRC restriction review",
  company_obligation: "Compliance register",
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
  const { client: selectedClient, lane: selectedLane } = Route.useSearch();
  const navigate = useNavigate({ from: "/dashboard/deadlines" });
  const { data: org } = useCurrentOrg();
  const isAdminRole =
    org?.role === "admin" ||
    org?.role === "program_manager" ||
    org?.role === "manager" ||
    org?.role === "super_admin";

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

  const applyFilter = (list: DeadlineItem[]) =>
    list.filter((i) => {
      if (selectedLane && i.lane !== selectedLane) return false;
      if (selectedClient && i.clientId !== selectedClient) return false;
      return true;
    });

  const overdueF = applyFilter(overdue);
  const dueSoonF = applyFilter(dueSoon);
  const upcomingF = applyFilter(upcoming);

  const setLane = (lane: DeadlineLane | undefined) => {
    navigate({
      search: (prev: { client?: string; lane?: DeadlineLane }) => ({
        ...prev,
        lane,
      }),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlarmClock className="h-6 w-6 text-[#137182]" />
            Deadlines
          </h1>
          <p className="text-sm text-muted-foreground">
            Who is late or due soon — the same clocks as the compliance register, in date order.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdminRole && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/dashboard/company-obligations">
                  <ClipboardList className="mr-1.5 h-4 w-4" />
                  Compliance register
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/dashboard/company-obligations" search={{ new: true }}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add company policy
                </Link>
              </Button>
            </>
          )}
          <label className="text-xs font-medium text-muted-foreground" htmlFor="client-filter">
            Client
          </label>
          <select
            id="client-filter"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={selectedClient ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              navigate({
                search: (prev: { client?: string; lane?: DeadlineLane }) => ({
                  ...prev,
                  client: v ? v : undefined,
                }),
              });
            }}
          >
            <option value="">All clients</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            [undefined, "All"],
            ["sow", "SOW — DHHS91172"],
            ["provider", "Company policy"],
            ["operational", "Live clocks"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setLane(key)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              selectedLane === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Same source as Compliance, two jobs: the register is the duty (upload, roster, citation);
        Deadlines is the calendar (Johnny, CPR, 9/15). Add a weekly meeting or weekly form with{" "}
        <span className="font-medium text-foreground">Add company policy</span>.
      </p>

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

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Upcoming (next 45 days) — {upcomingF.length}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowUpcoming((v) => !v)}>
            {showUpcoming ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {showUpcoming && (
          <CardContent>
            {upcomingF.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in the next 45 days.</p>
            ) : (
              <ItemList items={upcomingF} tone="upcoming" />
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

  const originBadge =
    item.source === "company_obligation" ? (
      item.obligationSource === "sow" ? (
        <Badge className="ml-2 border-transparent bg-blue-600 text-white hover:bg-blue-600">
          SOW — DHHS91172
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="ml-2 border-amber-400/60 bg-amber-500/10 text-amber-700 dark:border-amber-500/40 dark:text-amber-300"
        >
          Company policy
        </Badge>
      )
    ) : (
      <Badge variant="outline" className="ml-2">
        Live clock
      </Badge>
    );

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
            {originBadge}
            {item.source === "summary" && item.summary?.requires_upi_attestation && (
              <Badge className="ml-2 bg-[#137182] text-white hover:bg-[#137182]">
                {item.summary?.service_codes?.includes("SJD") &&
                !item.summary?.service_codes?.includes("SEI")
                  ? "SJD — Monthly UPI submission required"
                  : "SEI — Monthly UPI submission required"}
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.source === "company_obligation"
              ? item.obligationSource === "sow"
                ? "SOW"
                : "Company policy"
              : sourceLabel[item.source]}
            {" · "}
            {item.subject}
            {item.cadenceLabel ? ` · ${item.cadenceLabel}` : ""}
            {item.policySection ? ` · ${item.policySection}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-xs font-mono ${item.dueAtMissing ? "text-muted-foreground" : toneText}`}>
          {item.dueAtMissing ? "No due date set" : fmtDue(item.dueAt)}
        </span>
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

  if (item.source === "summary" && item.summary) {
    const s = item.summary;
    const needsUpi = !!s.requires_upi_attestation && !!s.finalized_at && !s.upi_entered_at;
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
          <Button size="sm" disabled={attest.isPending || !org} onClick={() => attest.mutate()}>
            Entered into UPI
          </Button>
        )}
      </div>
    );
  }

  if (item.href) {
    const label =
      item.subjectKind === "staff"
        ? "View staff"
        : item.subjectKind === "agency" || item.source === "company_obligation"
          ? "Open"
          : "View client";
    return (
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={item.href}>
            {label} <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    );
  }
  return null;
}

/** Compact card for the Home dashboard. */
export function DeadlinesHomeCard() {
  const { overdue, dueSoon, isLoading } = useDeadlines();
  const counts = useMemo(
    () => ({ overdue: overdue.length, dueSoon: dueSoon.length }),
    [overdue, dueSoon],
  );
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
