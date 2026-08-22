import { Badge } from "@/components/ui/badge";
import {
  PACK_STATUS_LABEL,
  UTAH_DSPD_COVERAGE,
  UTAH_DSPD_PACK,
  coverageCounts,
  packIntegrityErrors,
  type PackCoverageRow,
  type PackCoverageStatus,
} from "@/lib/utah-dspd-pack";

const STATUS_TONE: Record<PackCoverageStatus, string> = {
  encoded: "border-transparent bg-emerald-600/15 text-emerald-800 dark:text-emerald-300",
  live_artifact: "border-transparent bg-sky-600/15 text-sky-800 dark:text-sky-300",
  when_applicable: "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-200",
  intentional_omit: "border-transparent bg-slate-500/15 text-slate-800 dark:text-slate-300",
  gap: "border-transparent bg-destructive/15 text-destructive",
};

const SOURCE_LABEL: Record<PackCoverageRow["source"], string> = {
  sow: "Scope of Work",
  cst: "Client Service Terms",
  review_tool: "In-depth Review Tool",
};

function StatusBadge({ status }: { status: PackCoverageStatus }) {
  return <Badge className={STATUS_TONE[status]}>{PACK_STATUS_LABEL[status]}</Badge>;
}

export function UtahPackPanel() {
  const counts = coverageCounts();
  const integrity = packIntegrityErrors();
  const bySource = (["sow", "cst", "review_tool"] as const).map((source) => ({
    source,
    rows: UTAH_DSPD_COVERAGE.filter((r) => r.source === source),
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-sm font-semibold text-foreground">
          {UTAH_DSPD_PACK.contract} — {UTAH_DSPD_PACK.jurisdiction} pack {UTAH_DSPD_PACK.version}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          HIVE owns this encoding. Providers complete duties or attest a constrained N/A — they do
          not edit locked titles, citations, or due rules. Completing a row attests that the work
          was done, not that the pack is the whole contract.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Effective {UTAH_DSPD_PACK.effective}. Sources:{" "}
          {UTAH_DSPD_PACK.sources.map((s) => s.title).join(" · ")}.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-5">
        {(
          [
            ["encoded", counts.encoded],
            ["live_artifact", counts.live_artifact],
            ["when_applicable", counts.when_applicable],
            ["intentional_omit", counts.intentional_omit],
            ["gap", counts.gap],
          ] as const
        ).map(([status, n]) => (
          <div key={status} className="rounded-xl border border-border p-3">
            <p className="text-2xl font-bold">{n}</p>
            <p className="text-xs text-muted-foreground">{PACK_STATUS_LABEL[status]}</p>
          </div>
        ))}
      </div>

      {counts.gap === 0 ? (
        <p className="text-sm text-muted-foreground">
          No open pack gaps. Article 1 contractor shalls are either a locked duty, a live HIVE
          artifact, a when-applicable file, or an intentional omit (definitions, operational
          constraints, event-only cooperation).
        </p>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {counts.gap} pack gap{counts.gap === 1 ? "" : "s"} still need encoding. Those rows are
          HIVE work — not a provider “add to the pack” button.
        </p>
      )}

      {integrity.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <p className="font-medium">Pack integrity</p>
          <ul className="mt-1 list-disc pl-4">
            {integrity.slice(0, 12).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {integrity.length > 12 && <p className="mt-1">+{integrity.length - 12} more</p>}
        </div>
      )}

      {bySource.map(({ source, rows }) => (
        <section key={source} className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            {SOURCE_LABEL[source]}
            <span className="ml-2 font-normal text-muted-foreground">({rows.length})</span>
          </h3>
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr_auto]">
                <p className="text-xs font-medium text-muted-foreground">{row.citation}</p>
                <div>
                  <p className="text-sm font-medium text-foreground">{row.title}</p>
                  <p className="text-xs text-muted-foreground">{row.note}</p>
                  {row.catalog_titles && row.catalog_titles.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Duty: {row.catalog_titles.join(" · ")}
                    </p>
                  )}
                </div>
                <div className="sm:justify-self-end">
                  <StatusBadge status={row.status} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
