import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  CORE_RULE_LOGIC_SLICE,
  WORKBOOK_DESIGN_REVISION,
  WORKBOOK_SOURCE_TITLE,
  draftRuleAdminRow,
} from "@/lib/obligations/draft-rules";

export const Route = createFileRoute("/dashboard/settings/draft-rules")({
  head: () => ({ meta: [{ title: "Draft rules (simulation) — Provider Interface" }] }),
  component: DraftRulesSimulationPage,
});

function DraftRulesSimulationPage() {
  const { data: org } = useCurrentOrg();

  const rowsQuery = useQuery({
    queryKey: ["draft-rules-simulation", WORKBOOK_DESIGN_REVISION],
    queryFn: async () => CORE_RULE_LOGIC_SLICE.map(draftRuleAdminRow),
  });

  if (!org) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Select an organization to continue.</p>
      </div>
    );
  }

  const rows = rowsQuery.data ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        to="/dashboard/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Settings
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <FlaskConical className="h-5 w-5" /> Draft rules (simulation)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {WORKBOOK_SOURCE_TITLE} design revision {WORKBOOK_DESIGN_REVISION}. These rows are draft /
          not published. Simulation does not create live assignments or claim blocks. Source_index
          labels are archive metadata, not publication permission.
        </p>
      </div>

      {rowsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading draft rules…</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {row.id} · {row.clauseIds.join(", ")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">status={row.lifecycle}</Badge>
                  <Badge variant="outline">{row.publication}</Badge>
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {row.gaps.map((gap) => (
                  <li key={gap.key}>{gap.reason}</li>
                ))}
              </ul>
              <Button
                className="mt-3"
                variant="outline"
                disabled
                title={row.gaps.map((g) => g.reason).join(" ")}
              >
                Publish (disabled)
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
