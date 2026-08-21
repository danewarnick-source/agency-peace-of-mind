import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle, AlertTriangle, MinusCircle } from "lucide-react";
import {
  AUDIT_PART_HINT,
  DSPD_AUDIT_ITEMS,
  itemApplies,
  naReason,
  obligationTitleMatches,
  type AuditItem,
  type AuditPart,
  type OrgFootprint,
} from "@/lib/dspd-audit-tool";
import { FulfillmentBadge, RollupStatus, catalogFor } from "./obligation-meta";
import { ObligationCard, type ObligationWithInstance } from "./obligation-card";
import type { ObligationListItem } from "@/lib/company-obligations.functions";

function itemStatus(
  item: AuditItem,
  applies: boolean,
  linked: ObligationListItem[],
): { tone: "na" | "overdue" | "open" | "met" | "hive" | "gap"; label: string } {
  if (!applies) return { tone: "na", label: "N/A" };
  const overdue = linked.reduce((n, o) => n + o.rollup.overdue_count, 0);
  const open = linked.reduce((n, o) => n + o.rollup.open_count, 0);
  if (overdue > 0) return { tone: "overdue", label: `${overdue} overdue` };
  if (open > 0) return { tone: "open", label: `${open} open` };
  if (linked.length > 0) return { tone: "met", label: "Tracked" };
  if (item.hive_href) return { tone: "hive", label: "In HIVE" };
  return { tone: "gap", label: "Not a tracked duty yet" };
}

const TONE_CLASS = {
  na: "text-muted-foreground",
  overdue: "text-destructive",
  open: "text-warning-foreground",
  met: "text-success",
  hive: "text-emerald-800 dark:text-emerald-300",
  gap: "text-muted-foreground",
};

export function AuditPartPanel({
  part,
  footprint,
  includeNa,
  obligations,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  search = "",
}: {
  part: AuditPart;
  footprint: OrgFootprint;
  includeNa: boolean;
  obligations: ObligationListItem[];
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  search?: string;
}) {
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DSPD_AUDIT_ITEMS.filter((i) => i.part === part).filter((i) => {
      if (!includeNa && !itemApplies(i, footprint)) return false;
      if (!q) return true;
      return (
        i.prompt.toLowerCase().includes(q) ||
        i.citation.toLowerCase().includes(q) ||
        i.number.toLowerCase().includes(q) ||
        i.note.toLowerCase().includes(q) ||
        i.applies_to_codes.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [part, footprint, includeNa, search]);

  const linkedFor = (item: AuditItem) =>
    obligations.filter((o) =>
      item.obligation_titles.some((t) => obligationTitleMatches(o.title, t)),
    );

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {search.trim()
          ? "No review-tool rows in this part match your search."
          : "No review-tool rows in this part apply to the services this program provides. Use Show N/A to see the hidden rows."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{AUDIT_PART_HINT[part]}</p>
      <div className="grid gap-3">
        {items.map((item) => {
          const applies = itemApplies(item, footprint);
          const linked = linkedFor(item);
          return (
            <AuditItemRow
              key={item.id}
              item={item}
              applies={applies}
              linked={linked}
              orgId={orgId}
              groupNamesById={groupNamesById}
              userNamesById={userNamesById}
              publishedFormIds={publishedFormIds}
              onEdit={onEdit}
              footprint={footprint}
            />
          );
        })}
      </div>
    </div>
  );
}

function AuditItemRow({
  item,
  applies,
  linked,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
  footprint,
}: {
  item: AuditItem;
  applies: boolean;
  linked: ObligationListItem[];
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
  footprint: OrgFootprint;
}) {
  const [open, setOpen] = useState(false);
  const status = itemStatus(item, applies, linked);
  const Icon =
    status.tone === "overdue"
      ? AlertTriangle
      : status.tone === "met" || status.tone === "hive"
        ? CheckCircle2
        : status.tone === "na"
          ? MinusCircle
          : Circle;

  return (
    <div
      className={`rounded-xl border bg-card p-4 shadow-[var(--shadow-card)] ${applies ? "border-border" : "border-dashed border-border/70 opacity-80"}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">#{item.number}</span>
            <FulfillmentBadge channel={item.fulfillment} />
            {item.applies_to_codes.length > 0 && applies && (
              <Badge variant="outline">{item.applies_to_codes.join(", ")}</Badge>
            )}
          </div>
          <p className="mt-1.5 font-medium leading-snug">{item.prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">{item.citation}</p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-1.5 text-sm font-medium ${TONE_CLASS[status.tone]}`}
        >
          <Icon className="h-4 w-4" />
          {status.label}
        </div>
      </div>

      {!applies && (
        <p className="mt-2 text-xs text-muted-foreground">{naReason(item, footprint)}</p>
      )}

      {applies && (
        <>
          <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
          {linked.map((o) => (
            <div key={o.id} className="mt-2">
              <RollupStatus
                rollup={o.rollup}
                reminderOnly={catalogFor(o)?.calendar_is_reminder_only}
              />
            </div>
          ))}
          <div className="mt-3 flex flex-wrap gap-2">
            {item.hive_href && (
              <Button size="sm" variant="outline" asChild>
                <a href={item.hive_href}>
                  {item.hive_label ?? "Open in HIVE"} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {linked.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
                {open ? "Hide tracked duty" : `Show tracked duty (${linked.length})`}
              </Button>
            )}
          </div>
          {open && (
            <div className="mt-3 grid gap-3">
              {linked.map((o) => (
                <ObligationCard
                  key={o.id}
                  orgId={orgId}
                  obligation={o}
                  groupNamesById={groupNamesById}
                  userNamesById={userNamesById}
                  publishedFormIds={publishedFormIds}
                  onEdit={onEdit}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function UnmappedDuties({
  obligations,
  orgId,
  groupNamesById,
  userNamesById,
  publishedFormIds,
  onEdit,
}: {
  obligations: ObligationListItem[];
  orgId: string;
  groupNamesById: Map<string, { name: string; member_count: number }>;
  userNamesById: Map<string, string>;
  publishedFormIds: Set<string>;
  onEdit: (ob: ObligationWithInstance) => void;
}) {
  const extra = obligations.filter(
    (o) =>
      !DSPD_AUDIT_ITEMS.some((i) =>
        i.obligation_titles.some((t) => obligationTitleMatches(o.title, t)),
      ),
  );
  if (!extra.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Every tracked duty is already mapped to a numbered row on the in-depth review tool.
      </div>
    );
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">
        Other tracked duties
        <span className="ml-2 font-normal">({extra.length})</span>
      </h3>
      <p className="text-xs text-muted-foreground">
        Provider-defined obligations, or SOW duties that are not a numbered row on the in-depth
        review tool (for example SEI UPI employment-data attestations).
      </p>
      <div className="grid gap-3">
        {extra.map((o) => (
          <ObligationCard
            key={o.id}
            orgId={orgId}
            obligation={o}
            groupNamesById={groupNamesById}
            userNamesById={userNamesById}
            publishedFormIds={publishedFormIds}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}
