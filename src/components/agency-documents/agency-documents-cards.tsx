import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardCheck, Eye, FileDown, Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAgencyDocuments } from "@/lib/agency-documents.functions";
import {
  agencyDocPackHtml,
  agencyDocStatusLabel,
  missingAgencyDocCsv,
  type AgencyDocCard,
  type AgencyDocStatus,
} from "@/lib/agency-documents";
import { ManualCompletionDrawer } from "@/components/company-obligations/manual-completion-drawer";

function statusBadgeClass(status: AgencyDocStatus): string {
  if (status === "on_file") return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (status === "due_soon") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function formatDue(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function signedEvidenceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from("obligation-evidence").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open file");
  return data.signedUrl;
}

export function AgencyDocumentsCards({ organizationId }: { organizationId: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listAgencyDocuments);
  const [opening, setOpening] = useState<string | null>(null);
  const [packBusy, setPackBusy] = useState(false);
  const [complete, setComplete] = useState<AgencyDocCard | null>(null);

  const q = useQuery({
    queryKey: ["agency-documents", organizationId],
    enabled: !!organizationId,
    queryFn: () => listFn({ data: { organizationId } }),
  });

  const cards = useMemo(() => q.data?.cards ?? [], [q.data]);
  const flags = cards.filter((c) => c.layer === "flag");
  const encoded = cards.filter((c) => c.layer === "encoded");
  const counts = q.data?.counts ?? { missing: 0, due_soon: 0, on_file: 0 };

  const practiceAudit = () => {
    void navigate({
      to: "/dashboard/internal-audit",
      search: { area: "external_attestations" },
    });
  };

  const exportMissing = () => {
    const missing = cards.filter((c) => c.status === "missing");
    if (!missing.length) {
      toast.error("No missing items.");
      return;
    }
    const csv = missingAgencyDocCsv(cards);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agency-documents-missing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Missing-item CSV downloaded");
  };

  const exportPack = async () => {
    const onFile = cards.filter((c) => c.status === "on_file" && c.evidencePath);
    if (!onFile.length) {
      toast.error("No files on record to print.");
      return;
    }
    setPackBusy(true);
    try {
      const files = await Promise.all(
        onFile.map(async (item) => ({
          title: item.title,
          filename: item.evidenceFilename ?? "evidence",
          url: await signedEvidenceUrl(item.evidencePath!),
        })),
      );
      const win = window.open("", "_blank");
      if (!win) throw new Error("Pop-up blocked — allow pop-ups to print the pack.");
      win.document.write(agencyDocPackHtml(files));
      win.document.close();
      win.focus();
      win.print();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build the print pack");
    } finally {
      setPackBusy(false);
    }
  };

  const openEvidence = async (row: AgencyDocCard) => {
    if (!row.evidencePath) {
      toast.error("No file on this item yet.");
      return;
    }
    setOpening(row.key);
    try {
      const url = await signedEvidenceUrl(row.evidencePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open file");
    } finally {
      setOpening(null);
    }
  };

  if (q.isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading agency file…
      </div>
    );
  }
  if (q.error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-6 text-sm text-rose-700">
        {q.error instanceof Error ? q.error.message : "Could not load the agency file."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {counts.missing} missing · {counts.due_soon} due soon · {counts.on_file} on file.
          Practice audit opens Internal Audit — not a separate audit system.
          Company policies are not pulled as DSPD rows.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={practiceAudit}>
            <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
            Practice audit
          </Button>
          <Button variant="outline" size="sm" onClick={exportMissing}>
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
            Export missing CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPack()} disabled={packBusy}>
            {packBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Printer className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export pack
          </Button>
        </div>
      </div>

      <CardTable
        heading="Flags / standing docs"
        rows={flags}
        opening={opening}
        onView={openEvidence}
        onFile={setComplete}
      />
      <CardTable
        heading="Encoded policies / processes"
        rows={encoded}
        opening={opening}
        onView={openEvidence}
        onFile={setComplete}
      />

      <ManualCompletionDrawer
        open={!!complete}
        onOpenChange={(v) => {
          if (!v) {
            setComplete(null);
            void qc.invalidateQueries({ queryKey: ["agency-documents", organizationId] });
          }
        }}
        orgId={organizationId}
        instanceId={complete?.instanceId ?? null}
        obligationId={complete?.obligationId ?? undefined}
        attestationText={complete?.attestationText}
        evidenceType={complete?.evidenceType}
      />
    </div>
  );
}

function CardTable({
  heading,
  rows,
  opening,
  onView,
  onFile,
}: {
  heading: string;
  rows: AgencyDocCard[];
  opening: string | null;
  onView: (row: AgencyDocCard) => void;
  onFile: (row: AgencyDocCard) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {heading}
      </h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          None of these duties apply to the codes this organization runs.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Due</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-3 py-2">
                    <p className="font-medium text-[var(--hive-ink)]">{row.title}</p>
                    {row.evidenceFilename && (
                      <p className="text-xs text-muted-foreground">{row.evidenceFilename}</p>
                    )}
                    {row.coreSeedNeeded && (
                      <p className="text-xs text-muted-foreground">
                        No standing row yet — Core can seed this duty.
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {agencyDocStatusLabel(row.status)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDue(row.dueAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      {row.evidencePath ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={opening === row.key}
                          onClick={() => onView(row)}
                        >
                          {opening === row.key ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          View
                        </Button>
                      ) : row.obligationId ? (
                        <Button size="sm" variant="ghost" onClick={() => onFile(row)}>
                          File
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
