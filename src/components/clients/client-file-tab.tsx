import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listClientFileCards } from "@/lib/client-file.functions";
import {
  clientFileStatusLabel,
  type ClientFileCard,
  type ClientFileStatus,
} from "@/lib/client-file";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";

function statusBadgeClass(status: ClientFileStatus): string {
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

async function signedUrl(bucket: "client-documents" | "client-photos", path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Could not open file");
  return data.signedUrl;
}

export function ClientFileTab({
  organizationId,
  clientId,
  clientName,
}: {
  organizationId: string;
  clientId: string;
  clientName: string;
}) {
  const listFn = useServerFn(listClientFileCards);

  const q = useQuery({
    queryKey: ["client-file-cards", organizationId, clientId],
    enabled: !!organizationId && !!clientId,
    queryFn: () => listFn({ data: { organizationId, clientId } }),
  });

  const rows = useMemo(() => q.data ?? [], [q.data]);
  const [opening, setOpening] = useState<string | null>(null);

  const openEvidence = async (row: ClientFileCard) => {
    if (!row.evidencePath || !row.evidenceBucket) {
      toast.error("No file on this item yet.");
      return;
    }
    setOpening(row.key);
    try {
      const url = await signedUrl(row.evidenceBucket, row.evidencePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open file");
    } finally {
      setOpening(null);
    }
  };

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading client file…</p>;
  }
  if (q.error) {
    return (
      <p className="text-sm text-rose-700">
        {q.error instanceof Error ? q.error.message : "Could not load this client file."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing on this client file yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Due</th>
                <th className="px-3 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t">
                  <td className="px-3 py-2">
                    <p className="font-medium">{row.title}</p>
                    {row.evidenceFilename && (
                      <p className="text-xs text-muted-foreground">{row.evidenceFilename}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={statusBadgeClass(row.status)}>
                      {clientFileStatusLabel(row.status)}
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
                          onClick={() => void openEvidence(row)}
                        >
                          {opening === row.key ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          View
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={row.href}>Open</a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientDocumentsCard clientId={clientId} clientName={clientName} />
    </div>
  );
}
