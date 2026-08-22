import { Badge } from "@/components/ui/badge";
import { explainDueRule } from "@/lib/obligation-due-dates";
import {
  CATEGORY_LABEL,
  FULFILLMENT_LABEL,
  OWNER_LABEL,
  resolveDueRule,
  sowCatalogEntry,
  type FulfillmentChannel,
  type SowCatalogEntry,
} from "@/lib/sow-obligation-catalog";
import type { CompanyObligationRow, ObligationRollup } from "@/lib/company-obligations.functions";
import { Building2, FileWarning, FolderOpen, Layers } from "lucide-react";

export function catalogFor(ob: Pick<CompanyObligationRow, "title">): SowCatalogEntry | null {
  return sowCatalogEntry(ob.title);
}

export function dueExplanationFor(
  ob: Pick<CompanyObligationRow, "title" | "cadence" | "due_day_config">,
): string {
  const catalog = sowCatalogEntry(ob.title);
  if (catalog) return explainDueRule(catalog.due_rule);
  const rule = resolveDueRule(
    ob.title,
    ob.cadence,
    (ob.due_day_config ?? {}) as Record<string, unknown>,
  );
  return rule ? explainDueRule(rule) : "";
}

const FULFILLMENT_TONE: Record<FulfillmentChannel, string> = {
  in_hive: "border-transparent bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  external: "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-200",
  hybrid: "border-transparent bg-sky-600/15 text-sky-800 dark:text-sky-300",
  standing: "border-transparent bg-slate-500/15 text-slate-800 dark:text-slate-300",
};

const FULFILLMENT_ICON: Record<FulfillmentChannel, typeof FolderOpen> = {
  in_hive: FolderOpen,
  external: Building2,
  hybrid: Layers,
  standing: FileWarning,
};

export function FulfillmentBadge({ channel }: { channel: FulfillmentChannel }) {
  const Icon = FULFILLMENT_ICON[channel];
  return (
    <Badge className={FULFILLMENT_TONE[channel]}>
      <Icon className="mr-1 h-3 w-3" />
      {FULFILLMENT_LABEL[channel]}
    </Badge>
  );
}

export function CatalogBadges({ ob }: { ob: Pick<CompanyObligationRow, "title"> }) {
  const catalog = sowCatalogEntry(ob.title);
  if (!catalog) return null;
  return (
    <>
      <FulfillmentBadge channel={catalog.fulfillment} />
      <Badge variant="outline">{CATEGORY_LABEL[catalog.category]}</Badge>
      <Badge variant="secondary">Owner: {OWNER_LABEL[catalog.owner]}</Badge>
    </>
  );
}

export function formatDue(iso: string | null | undefined): string {
  if (!iso) return "No due date";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RollupStatus({
  rollup,
  reminderOnly,
}: {
  rollup: ObligationRollup | undefined;
  reminderOnly?: boolean;
}) {
  if (!rollup) return null;
  if (rollup.overdue_count > 0) {
    return (
      <p className="text-sm font-medium text-destructive">
        {rollup.overdue_count} overdue
        {rollup.pending_count > 0 ? ` · ${rollup.pending_count} upcoming` : ""}
        {rollup.next_due_at ? ` · next ${formatDue(rollup.next_due_at)}` : ""}
        {reminderOnly ? " (verification reminder)" : ""}
      </p>
    );
  }
  if (rollup.pending_count > 0) {
    return (
      <p className="text-sm font-medium text-warning-foreground">
        {rollup.pending_count} open · due {formatDue(rollup.next_due_at)}
        {reminderOnly ? " (verification reminder)" : ""}
      </p>
    );
  }
  if (rollup.latest_completed_at) {
    return (
      <p className="text-sm font-medium text-success">
        Satisfied {formatDue(rollup.latest_completed_at)}
      </p>
    );
  }
  return (
    <p className="text-sm text-muted-foreground">
      No instance yet — due date cannot be computed until assignment data is in place.
    </p>
  );
}
