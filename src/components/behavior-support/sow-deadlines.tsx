import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { computeDeadlines, type DeadlineRow } from "@/lib/bc-deadlines";

export function SowDeadlinesPanel({
  clientId,
  organizationId,
  canWriteFlags,
}: {
  clientId: string;
  organizationId: string;
  canWriteFlags: boolean;
}) {
  const { data } = useQuery({
    queryKey: ["bc_deadlines_inputs", clientId],
    queryFn: async () => {
      const [docs, bsc, monthly, lastEntry] = await Promise.all([
        supabase
          .from("bc_documents")
          .select("doc_type, uploaded_at")
          .eq("client_id", clientId)
          .eq("is_current", true),
        supabase
          .from("behavior_support_clients")
          .select("created_at")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("bc_review_notes")
          .select("created_at")
          .eq("client_id", clientId)
          .eq("note_type", "monthly_review")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("bc_data_entries")
          .select("occurred_at")
          .eq("client_id", clientId)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const fba = docs.data?.find((d) => d.doc_type === "FBA")?.uploaded_at ?? null;
      const bsp = docs.data?.find((d) => d.doc_type === "BSP")?.uploaded_at ?? null;
      return {
        rows: computeDeadlines({
          fbaUploadedAt: fba,
          bspUploadedAt: bsp,
          lastMonthlyReviewAt: monthly.data?.created_at ?? null,
          lastDataEntryAt: lastEntry.data?.occurred_at ?? null,
          bcConfigEnabledAt: bsc.data?.created_at ?? null,
        }),
      };
    },
  });

  const rows = data?.rows ?? [];

  // Best-effort write/refresh of overdue flags (one row per key per refresh).
  useEffect(() => {
    if (!canWriteFlags || rows.length === 0) return;
    const overdue = rows.filter((r) => r.status === "overdue" || r.status === "missing");
    if (overdue.length === 0) return;
    void (async () => {
      for (const r of overdue) {
        await supabase.from("bc_flags").insert({
          organization_id: organizationId,
          client_id: clientId,
          flag_type: "deadline_overdue",
          detail: `${r.label}: ${r.note}`,
        });
      }
    })();
    // Only when row set materially changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => `${r.key}:${r.status}`).join("|"), clientId, organizationId, canWriteFlags]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SOW deadlines</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <DeadlineLi key={r.key} row={r} />
          ))}
        </ul>
        <p className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-2 py-1 text-[11px] italic text-muted-foreground">
          HIVE tracks deliverables; the provider/clinician owns clinical content. Confirm against current Utah DSPD SOW.
        </p>
      </CardContent>
    </Card>
  );
}

function DeadlineLi({ row }: { row: DeadlineRow }) {
  const tone =
    row.status === "overdue" || row.status === "missing"
      ? "text-rose-700 dark:text-rose-300"
      : row.status === "due_soon"
        ? "text-amber-800 dark:text-amber-200"
        : "text-emerald-800 dark:text-emerald-300";
  const Icon =
    row.status === "overdue" || row.status === "missing"
      ? AlertTriangle
      : row.status === "due_soon"
        ? Clock
        : CheckCircle2;
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.label}</p>
          <p className={`text-[11px] ${tone}`}>{row.note}</p>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] font-mono uppercase">
        {row.status.replace("_", " ")}
      </Badge>
    </li>
  );
}
