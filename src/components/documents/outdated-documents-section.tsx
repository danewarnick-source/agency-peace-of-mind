/**
 * OutdatedDocumentsSection
 *
 * Shared "Outdated / Superseded" retention list rendered under the current
 * documents in each of the three surfaces:
 *   - client Files (kind="client", clientId set)
 *   - employee HR Docs (kind="employee", staffId set)
 *   - Knowledge Base → Company Docs (kind="nectar", no subject filter)
 *
 * Outdated documents are RETAINED (never deleted), viewable in place, and
 * remain stored for point-in-time use (later pass) and audit.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listOutdatedDocuments, type DocKind, type OutdatedDocument } from "@/lib/document-effective-dating.functions";

function formatRange(from: string | null, to: string | null, mode: string | null): string {
  const f = from ? new Date(from + "T00:00:00").toLocaleDateString() : "?";
  if (to) return `${f} → ${new Date(to + "T00:00:00").toLocaleDateString()}`;
  if (mode === "ongoing") return `${f} → ongoing`;
  if (mode === "until_replaced") return `${f} → until replaced`;
  return `${f} → ?`;
}

export function OutdatedDocumentsSection({
  organizationId,
  kind,
  clientId,
  staffId,
  title,
  onOpen,
}: {
  organizationId: string | undefined;
  kind: DocKind;
  clientId?: string | null;
  staffId?: string | null;
  title?: string;
  /** Optional per-surface open handler that resolves a signed URL. */
  onOpen?: (doc: OutdatedDocument) => void;
}) {
  const listFn = useServerFn(listOutdatedDocuments);
  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["outdated-docs", kind, organizationId, clientId ?? null, staffId ?? null],
    queryFn: () =>
      listFn({
        data: {
          organization_id: organizationId!,
          kind,
          client_id: clientId ?? null,
          staff_id: staffId ?? null,
        },
      }),
  });

  const docs = q.data?.documents ?? [];
  const heading =
    title ||
    (kind === "nectar" ? "Outdated Company Docs" : "Outdated / Superseded");

  if (!q.isLoading && docs.length === 0) return null;

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2 pb-2">
        <Archive className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {heading}
        </span>
        {docs.length > 0 && (
          <Badge variant="outline" className="text-[10px]">{docs.length}</Badge>
        )}
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="divide-y divide-border/50">
          {docs.map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-2 py-2">
              <div className="flex min-w-0 items-start gap-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm">
                      {d.file_name || d.title || "(untitled)"}
                    </span>
                    {d.document_type && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                        {d.document_type.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase text-amber-700 dark:text-amber-300">
                      outdated
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatRange(d.effective_from, d.effective_to, d.effective_to_mode)}
                    {d.superseded_at
                      ? ` · superseded ${new Date(d.superseded_at).toLocaleDateString()}`
                      : ""}
                  </div>
                </div>
              </div>
              {onOpen && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpen(d)}>
                  Open
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
