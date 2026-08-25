import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlarmClock,
  AlertTriangle,
  ChevronDown,
  Clock,
  ClipboardList,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDeadlines, type DeadlineItem, type DeadlineLane } from "@/hooks/use-deadlines";
import { useCurrentOrg } from "@/hooks/use-org";
import { attestSummaryUpiEntered } from "@/lib/progress-summaries.functions";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  client: z.string().uuid().optional(),
  lane: z.enum(["sow", "provider", "operational"]).optional(),
});

export const Route = createFileRoute("/dashboard/deadlines")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Deadlines — HIVE" }] }),
  component: DeadlinesPage,
});

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

function laneLabel(item: DeadlineItem): string {
  if (item.source === "company_obligation") {
    return item.obligationSource === "sow" ? "SOW" : "Company policy";
  }
  if (item.source === "summary") return "Progress summary";
  if (item.source === "incident") return "Incident clock";
  return "HRC review";
}

type DutyGroup = { key: string; dutyTitle: string; items: DeadlineItem[] };

function groupDeadlineItems(items: DeadlineItem[]): DutyGroup[] {
  const order: string[] = [];
  const map = new Map<string, DeadlineItem[]>();
  for (const item of items) {
    const key = item.obligationId ? `ob:${item.obligationId}` : `one:${item.key}`;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key)!.push(item);
  }
  return order.map((key) => {
    const list = map.get(key)!;
    return {
      key,
      dutyTitle: list[0].dutyTitle ?? list[0].title,
      items: list,
    };
  });
}

function DeadlinesPage() {
  const { overdue, dueSoon, upcoming, isLoading } = useDeadlines();
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
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <AlarmClock className="h-6 w-6 text-[#137182]" />
            Deadlines
          </h1>
          <p className="text-sm text-muted-foreground">
            Who is late or due soon — same clocks as the compliance register, in date order.
          </p>
        </div>
        {isAdminRole && (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/dashboard/company-obligations">
                <ClipboardList className="mr-1.5 h-4 w-4" />
                Register
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/dashboard/company-obligations" search={{ new: true }}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add company policy
              </Link>
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {(
            [
              [undefined, "All"],
              ["sow", "SOW"],
              ["provider", "Company policy"],
              ["operational", "Live clocks"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setLane(key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                selectedLane === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {clientOptions.length > 0 && (
          <select
            id="client-filter"
            aria-label="Filter by client"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
            <option value="">All people</option>
            {clientOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3">
          <DeadlineSection
            title="Overdue"
            count={overdueF.length}
            tone="overdue"
            defaultOpen
            empty="Nothing overdue."
            items={overdueF}
            groupsOpen
            isAdminRole={isAdminRole}
          />
          <DeadlineSection
            title="Due this week"
            count={dueSoonF.length}
            tone="due_soon"
            defaultOpen
            empty="Nothing due in the next 7 days."
            items={dueSoonF}
            groupsOpen
            isAdminRole={isAdminRole}
          />
          <DeadlineSection
            title="Upcoming"
            count={upcomingF.length}
            tone="upcoming"
            defaultOpen={false}
            empty="Nothing in the next 45 days."
            items={upcomingF}
            groupsOpen={false}
            isAdminRole={isAdminRole}
          />
        </div>
      )}
    </div>
  );
}

function DeadlineSection({
  title,
  count,
  tone,
  defaultOpen,
  empty,
  items,
  groupsOpen,
  isAdminRole,
}: {
  title: string;
  count: number;
  tone: DeadlineItem["status"];
  defaultOpen: boolean;
  empty: string;
  items: DeadlineItem[];
  groupsOpen: boolean;
  isAdminRole: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = tone === "overdue" ? AlertTriangle : Clock;
  const countClass =
    tone === "overdue" && count > 0
      ? "text-rose-700 dark:text-rose-300"
      : tone === "due_soon" && count > 0
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border border-border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon className={cn("h-4 w-4", countClass)} />
              {title}
              <span className={cn("tabular-nums font-medium", countClass)}>{count}</span>
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border px-2 pb-1 sm:px-3">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">{empty}</p>
            ) : (
              <GroupedItemList items={items} tone={tone} groupsOpen={groupsOpen} isAdminRole={isAdminRole} />
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function GroupedItemList({
  items,
  tone,
  groupsOpen,
  isAdminRole,
}: {
  items: DeadlineItem[];
  tone: DeadlineItem["status"];
  groupsOpen: boolean;
  isAdminRole: boolean;
}) {
  const groups = groupDeadlineItems(items);
  return (
    <ul>
      {groups.map((group) =>
        group.items.length === 1 ? (
          <DeadlineRow
            key={group.items[0].key}
            item={group.items[0]}
            tone={tone}
            isAdminRole={isAdminRole}
          />
        ) : (
          <li key={group.key} className="border-b border-border last:border-b-0">
            <DutyGroup group={group} tone={tone} defaultOpen={groupsOpen} isAdminRole={isAdminRole} />
          </li>
        ),
      )}
    </ul>
  );
}

function DutyGroup({
  group,
  tone,
  defaultOpen,
  isAdminRole,
}: {
  group: DutyGroup;
  tone: DeadlineItem["status"];
  defaultOpen: boolean;
  isAdminRole: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const earliest = group.items[0];
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-2 py-2.5 text-left hover:bg-accent/40"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{group.dutyTitle}</span>
            <span className="text-xs text-muted-foreground">
              {group.items.length} people
              {earliest.cadenceLabel ? ` · ${earliest.cadenceLabel}` : ""}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {earliest.dueAtMissing ? "No due date" : fmtDue(earliest.dueAt)}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mb-2 ml-2 border-l border-border pl-2">
          {group.items.map((item) => (
            <DeadlineRow
              key={item.key}
              item={item}
              tone={tone}
              nested
              isAdminRole={isAdminRole}
            />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

function DeadlineRow({
  item,
  tone,
  nested = false,
  isAdminRole,
}: {
  item: DeadlineItem;
  tone: DeadlineItem["status"];
  nested?: boolean;
  isAdminRole: boolean;
}) {
  const toneText =
    tone === "overdue"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "due_soon"
        ? "text-amber-700 dark:text-amber-200"
        : "text-muted-foreground";

  const heading = nested
    ? item.subject
    : item.subjectKind === "agency"
      ? (item.dutyTitle ?? item.title)
      : `${item.subject} · ${item.dutyTitle ?? item.title}`;

  const meta = [
    nested ? undefined : laneLabel(item),
    item.cadenceLabel,
    item.policySection,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="flex items-center gap-2 border-b border-border last:border-b-0">
      <DeadlineRowLink item={item} isAdminRole={isAdminRole}>
        <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 px-2 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{heading}</p>
            {meta ? <p className="truncate text-xs text-muted-foreground">{meta}</p> : null}
          </div>
          <span className={cn("shrink-0 font-mono text-xs", item.dueAtMissing ? "text-muted-foreground" : toneText)}>
            {item.dueAtMissing ? "No due date" : fmtDue(item.dueAt)}
          </span>
        </div>
      </DeadlineRowLink>
      <RowAction item={item} />
    </li>
  );
}

function DeadlineRowLink({
  item,
  isAdminRole,
  children,
}: {
  item: DeadlineItem;
  isAdminRole: boolean;
  children: ReactNode;
}) {
  const className =
    "min-w-0 flex-1 rounded-md outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring";
  if (item.obligationId && isAdminRole) {
    return (
      <Link
        to="/dashboard/company-obligations"
        search={{ obligation: item.obligationId }}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (item.href) {
    return (
      <a href={item.href} className={className}>
        {children}
      </a>
    );
  }
  return <div className="min-w-0 flex-1">{children}</div>;
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
    if (!needsUpi) return null;
    return (
      <Button
        size="sm"
        className="mr-1 shrink-0"
        disabled={attest.isPending || !org}
        onClick={(e) => {
          e.preventDefault();
          attest.mutate();
        }}
      >
        Entered into UPI
      </Button>
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
