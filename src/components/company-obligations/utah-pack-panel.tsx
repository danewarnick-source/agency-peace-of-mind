import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  PACK_STATUS_LABEL,
  UTAH_DSPD_PACK,
  coverageCounts,
  packIntegrityErrors,
  sectionedCoverage,
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

function StatusBadge({ status }: { status: PackCoverageStatus }) {
  return <Badge className={STATUS_TONE[status]}>{PACK_STATUS_LABEL[status]}</Badge>;
}

function CoverageRow({ row }: { row: PackCoverageRow }) {
  return (
    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr_auto]">
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
  );
}

export function UtahPackPanel() {
  const counts = coverageCounts();
  const integrity = packIntegrityErrors();
  const sections = useMemo(() => sectionedCoverage(), []);
  const allIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const [open, setOpen] = useState<string[]>([]);

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
          Open one section at a time. Article 1 follows the SOW. TNS-awarded codes are marked. Other
          codes stay encoded for the next tenant — TNS should not complete those rows.
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

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(allIds)}>
          Expand all
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen([])}>
          Collapse all
        </Button>
      </div>

      <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-2">
        {sections.map((section) => {
          const local = coverageCounts(section.rows);
          return (
            <AccordionItem
              key={section.id}
              value={section.id}
              className="overflow-hidden rounded-xl border border-border border-b-0 px-3"
            >
              <AccordionTrigger className="py-3 hover:no-underline">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1 pr-3 text-left">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold text-foreground">{section.title}</span>
                    <Badge variant="secondary">{section.rows.length}</Badge>
                    {section.tnsPrimary && <Badge variant="outline">TNS</Badge>}
                    {local.gap > 0 && (
                      <Badge className={STATUS_TONE.gap}>
                        {local.gap} gap{local.gap === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs font-normal text-muted-foreground">{section.hint}</p>
                  <p className="text-[11px] font-normal text-muted-foreground">
                    {local.encoded} encoded · {local.live_artifact} live · {local.when_applicable}{" "}
                    when applicable · {local.intentional_omit} omitted
                  </p>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-0">
                <div className="-mx-3 divide-y divide-border border-t border-border">
                  {section.rows.map((row) => (
                    <CoverageRow key={row.id} row={row} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
