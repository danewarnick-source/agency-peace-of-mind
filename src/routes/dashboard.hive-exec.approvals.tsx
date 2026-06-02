import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  FileText,
  Loader2,
  AlertTriangle,
  Building2,
} from "lucide-react";
import {
  listPendingHiveExecApprovals,
  hiveExecApproveRequirement,
  hiveExecRejectRequirement,
} from "@/lib/nectar-approvals.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/dashboard/hive-exec/approvals")({
  head: () => ({ meta: [{ title: "Extraction Approvals — HIVE" }] }),
  component: ApprovalsPage,
});

type Item = {
  id: string;
  organizationId: string;
  organizationName: string;
  sourceDocumentId: string | null;
  sourceTitle: string | null;
  sourceKind: string | null;
  title: string;
  description: string | null;
  category: string | null;
  sourceCitation: string | null;
  appliesTo: string | null;
  createdAt: string;
};

function ApprovalsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPendingHiveExecApprovals);
  const approveFn = useServerFn(hiveExecApproveRequirement);
  const rejectFn = useServerFn(hiveExecRejectRequirement);

  const { data, isLoading } = useQuery({
    queryKey: ["hive-exec-approvals"],
    queryFn: () => listFn(),
  });

  const approve = useMutation({
    mutationFn: (vars: { requirementId: string; note?: string }) =>
      approveFn({ data: { requirementId: vars.requirementId, note: vars.note ?? null } }),
    onSuccess: () => {
      toast.success("Extraction approved — provider notified.");
      qc.invalidateQueries({ queryKey: ["hive-exec-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: (vars: { requirementId: string; reason: string }) =>
      rejectFn({ data: { requirementId: vars.requirementId, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("Sent back to NECTAR for re-drafting.");
      qc.invalidateQueries({ queryKey: ["hive-exec-approvals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = (data?.items ?? []) as Item[];

  return (
    <div className="space-y-4">
      {/* Liability banner — critical to keep visible */}
      <section className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#d97a1c] text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#9a3412]">
              HIVE Executive · Extraction approval queue
            </div>
            <h1 className="font-display text-lg font-semibold text-[#7c2d12]">
              Verify NECTAR read the source accurately
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[#7c2d12]/85">
              You are confirming that NECTAR extracted and structured this
              requirement <strong>faithfully from the source document</strong>.
              You are <strong>not</strong> confirming whether the provider must
              follow it — the provider is always the final authority on their
              own obligations. After you approve, the requirement moves to the
              provider's queue for their final confirmation.
            </p>
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading queue…
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
          Inbox zero — no NECTAR drafts awaiting your verification.
        </div>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <ApprovalCard
            key={it.id}
            item={it}
            onApprove={(note) => approve.mutate({ requirementId: it.id, note })}
            onReject={(reason) => reject.mutate({ requirementId: it.id, reason })}
            busy={approve.isPending || reject.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({
  item,
  onApprove,
  onReject,
  busy,
}: {
  item: Item;
  onApprove: (note?: string) => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [note, setNote] = useState("");

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5">
              <Building2 className="h-3 w-3" /> {item.organizationName}
            </span>
            {item.sourceTitle && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5">
                <FileText className="h-3 w-3" /> {item.sourceTitle}
              </span>
            )}
            {item.category && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5">
                {item.category}
              </span>
            )}
          </div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {item.title}
          </h2>
          {item.description && (
            <p className="mt-1 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">
              {item.description}
            </p>
          )}
          {item.sourceCitation && (
            <p className="mt-2 text-xs text-muted-foreground">
              <strong className="text-foreground">Source citation:</strong>{" "}
              {item.sourceCitation}
            </p>
          )}
          {item.appliesTo && (
            <p className="mt-1 text-xs text-muted-foreground">
              <strong className="text-foreground">Applies to:</strong>{" "}
              {item.appliesTo}
            </p>
          )}
        </div>
      </header>

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => setMode("approve")}
            disabled={busy}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-1 h-4 w-4" /> Approve extraction
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode("reject")}
            disabled={busy}
          >
            <XCircle className="mr-1 h-4 w-4" /> Send back to NECTAR
          </Button>
        </div>
      )}

      {mode === "approve" && (
        <div className="mt-3 space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs text-emerald-900">
            Confirming faithful extraction. Optional note (visible in audit log):
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Wording matches §3.2(a) verbatim."
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onApprove(note.trim() || undefined)}
              disabled={busy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Confirm approval
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "reject" && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
          <p className="flex items-center gap-1 text-xs text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />
            Required: explain what NECTAR got wrong so the next draft can fix it.
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Wrong citation — this clause is §3.4, not §3.2."
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (note.trim().length < 3) {
                  toast.error("Add a short reason (3+ characters).");
                  return;
                }
                onReject(note.trim());
              }}
              disabled={busy}
            >
              Send back to NECTAR
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
