/**
 * Nectar helper panel for the eMAR — surfaces advisory drafts for refusal→success
 * timelines, controlled history, swallowing-risk meds, and documentation gaps.
 * All output is clearly framed as a draft for human review. Calls
 * emarNectarHelper which reads only real records.
 */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertTriangle } from "lucide-react";
import { emarNectarHelper } from "@/lib/emar-nectar.functions";

type Kind = "refusal_then_success" | "controlled_history" | "swallowing_risk_meds" | "documentation_gap_check";
const KIND_LABEL: Record<Kind, string> = {
  refusal_then_success: "Refusal → success timeline",
  controlled_history: "Controlled-substance history",
  swallowing_risk_meds: "Swallowing-risk meds",
  documentation_gap_check: "Documentation gap check (30d)",
};

export function EmarNectarPanel({ clientId }: { clientId: string }) {
  const run = useServerFn(emarNectarHelper);
  const [kind, setKind] = useState<Kind | null>(null);
  const [result, setResult] = useState<string>("");

  const mut = useMutation({
    mutationFn: async (k: Kind) => run({ data: { clientId, kind: k } }),
    onSuccess: (r) => setResult(r?.content ?? ""),
    onError: (e: Error) => setResult(`Error: ${e.message}`),
  });

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-amber-500" /> Nectar — eMAR helper
        <Badge variant="outline" className="ml-auto text-[10px]">Advisory draft</Badge>
      </div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Read-only analysis of this Person's real records. Nectar never logs or
        modifies a medication pass — every entry remains the staff signature of record.
      </p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} className="h-8"
            disabled={mut.isPending}
            onClick={() => { setKind(k); setResult(""); mut.mutate(k); }}>
            {KIND_LABEL[k]}
          </Button>
        ))}
      </div>
      {mut.isPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Analyzing real records…
        </p>
      )}
      {!!result && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/20">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" /> Draft — review before acting
          </div>
          <p className="whitespace-pre-wrap leading-relaxed">{result}</p>
        </div>
      )}
    </Card>
  );
}
