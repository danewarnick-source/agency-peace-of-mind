import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import { buildCatalogCoverageReport } from "@/lib/obligations/catalog-coverage";
import { loadCommittedCatalog } from "@/lib/obligations/draft-rules/catalog-committed";
import {
  CORE_RULE_LOGIC_SLICE,
  FIRST_EXECUTABLE_BATCH_RULE_IDS,
  WORKBOOK_DESIGN_REVISION,
  WORKBOOK_SOURCE_TITLE,
  draftRuleAdminRow,
  firstExecutableBatchParents,
} from "@/lib/obligations/draft-rules";

export const Route = createFileRoute("/dashboard/settings/draft-rules")({
  head: () => ({ meta: [{ title: "Draft rules (simulation) — Provider Interface" }] }),
  component: DraftRulesSimulationPage,
});

function DraftRulesSimulationPage() {
  const { data: org } = useCurrentOrg();

  const firstBatchQuery = useQuery({
    queryKey: ["draft-rules-first-batch", WORKBOOK_DESIGN_REVISION],
    queryFn: async () => {
      const loaded = loadCommittedCatalog();
      return firstExecutableBatchParents(loaded.parents).map((rule) => ({
        ...draftRuleAdminRow(rule),
        liveKey: rule.catalogKeys[0] ?? null,
      }));
    },
  });

  const rowsQuery = useQuery({
    queryKey: ["draft-rules-simulation", WORKBOOK_DESIGN_REVISION],
    queryFn: async () =>
      CORE_RULE_LOGIC_SLICE.filter(
        (rule) => !(FIRST_EXECUTABLE_BATCH_RULE_IDS as readonly string[]).includes(rule.id),
      ).map(draftRuleAdminRow),
  });

  const catalogQuery = useQuery({
    queryKey: ["draft-rules-catalog-coverage", WORKBOOK_DESIGN_REVISION],
    queryFn: async () => {
      const loaded = loadCommittedCatalog();
      const report = buildCatalogCoverageReport(loaded);
      return {
        workbookSha256: report.workbookSha256,
        ingestStatus: loaded.ingestStatus,
        counts: report.counts,
        sourceIndex: "ARCHIVE METADATA" as const,
      };
    },
  });

  if (!org) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Select an organization to continue.</p>
      </div>
    );
  }

  const firstBatch = firstBatchQuery.data ?? [];
  const rows = rowsQuery.data ?? [];
  const counts = catalogQuery.data?.counts;

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
          {WORKBOOK_SOURCE_TITLE} design revision {WORKBOOK_DESIGN_REVISION}. Imported catalog
          parents reuse the live obligation engine (assignments, evidence, training, forms,
          reminders, admin review). Child elements stay on the parent and do not mint a second staff
          task. Publication is per verified rule — unrelated Release_Gaps do not lock the catalog.
          Source_index is archive metadata, not permission.
        </p>
      </div>

      {catalogQuery.data && counts ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm shadow-[var(--shadow-card)]">
          <p className="font-semibold">Finalized catalog coverage</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            <li>Workbook sha256 {catalogQuery.data.workbookSha256}</li>
            <li>
              Imported {counts.importedParents} parents / {counts.importedElements} elements (
              {catalogQuery.data.ingestStatus})
            </li>
            <li>
              Executable (live key) {counts.executable} · wired first batch {counts.wired} ·
              verified {counts.verified} · published {counts.published} · blocked {counts.blocked} ·
              unwired {counts.draftUnwired}
            </li>
            <li>
              Source_index={catalogQuery.data.sourceIndex} · canActivateAny=
              {counts.published > 0 ? "mixed" : "false"}
            </li>
          </ul>
        </div>
      ) : null}

      {firstBatchQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading first executable batch…</p>
      ) : firstBatch.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">First executable batch — hire training clocks</h2>
          <p className="text-sm text-muted-foreground">
            Orientation, CPR / First Aid, person-centered thinking, behavior certification, annual
            12-hour CE, and ABI reuse the live obligation engine. One parent assignment. Child
            elements stay on the parent. Missing assignment facts stay questions. Not published.
          </p>
          <ul className="space-y-4">
            {firstBatch.map((row) => {
              const ready = row.canPublish && !row.canActivate;
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{row.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.id}
                        {row.liveKey ? ` · live ${row.liveKey}` : ""} · {row.clauseIds.join(", ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">status={row.lifecycle}</Badge>
                      <Badge variant="outline">{row.publication}</Badge>
                      {row.canActivate ? (
                        <Badge>activatable</Badge>
                      ) : ready ? (
                        <Badge variant="outline">wired — ready for per-rule publish</Badge>
                      ) : (
                        <Badge variant="outline">draft</Badge>
                      )}
                    </div>
                  </div>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {row.gaps.length === 0 ? (
                      <li>
                        Wired to the live engine. Unrelated workbook Release_Gaps do not block this
                        rule. Record an explicit approval to publish this rule only.
                      </li>
                    ) : (
                      row.gaps.map((gap) => <li key={gap.key}>{gap.reason}</li>)
                    )}
                  </ul>
                  <Button
                    className="mt-3"
                    variant="outline"
                    disabled
                    title={
                      row.canActivate
                        ? "This rule is individually verified."
                        : ready
                          ? "Record approval in the verified-publication overlay. This screen does not flip tenants."
                          : row.gaps.map((g) => g.reason).join(" ")
                    }
                  >
                    {row.canActivate ? "Published (this rule)" : "Publish this rule"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {rowsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading remaining draft rules…</p>
      ) : (
        <ul className="space-y-4">
          {rows.length > 0 ? (
            <li className="list-none">
              <h2 className="text-sm font-semibold">Remaining Core_Rule_Logic fixtures</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Later shared-behavior batches. Still draft. Not this PR.
              </p>
            </li>
          ) : null}
          {rows.map((row) => {
            const ready = row.canPublish && !row.canActivate;
            return (
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
                    {row.canActivate ? (
                      <Badge>activatable</Badge>
                    ) : ready ? (
                      <Badge variant="outline">ready for per-rule publish</Badge>
                    ) : (
                      <Badge variant="outline">draft</Badge>
                    )}
                  </div>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {row.gaps.length === 0 ? (
                    <li>
                      Structurally complete. Unrelated workbook Release_Gaps do not block this rule.
                      Record an explicit approval to publish this rule only.
                    </li>
                  ) : (
                    row.gaps.map((gap) => <li key={gap.key}>{gap.reason}</li>)
                  )}
                </ul>
                <Button
                  className="mt-3"
                  variant="outline"
                  disabled
                  title={
                    row.canActivate
                      ? "This rule is individually verified."
                      : ready
                        ? "Record approval in the verified-publication overlay. This screen does not flip tenants."
                        : row.gaps.map((g) => g.reason).join(" ")
                  }
                >
                  {row.canActivate ? "Published (this rule)" : "Publish this rule"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
