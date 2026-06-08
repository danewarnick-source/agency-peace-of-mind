import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Loader2,
  ShieldAlert,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getClientIntakeChecklist,
  upsertClientIntakeCompletion,
} from "@/lib/client-hr.functions";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";

const STATUSES = [
  "not_started",
  "in_progress",
  "complete",
  "expired",
  "waived",
  "not_applicable",
] as const;

const STATUS_LABEL: Record<(typeof STATUSES)[number], string> = {
  not_started: "not started",
  in_progress: "in progress",
  complete: "complete",
  expired: "expired",
  waived: "waived",
  not_applicable: "n/a",
};

/**
 * Client Intake checklist — admin + any staffer assigned to this client.
 * Fail-closed: if the server fn throws (gate denied), the card shows an
 * explicit "no access" panel and nothing else renders.
 *
 * Conditional items (photo/media, HRC, support strategies) don't count as
 * gaps unless the user explicitly marks them required (status != n/a).
 */
export function ClientIntakeChecklistCard({
  organizationId,
  clientId,
  clientName,
}: {
  organizationId: string;
  clientId: string;
  clientName: string;
}) {
  const qc = useQueryClient();
  const fetchChecklist = useServerFn(getClientIntakeChecklist);
  const upsertFn = useServerFn(upsertClientIntakeCompletion);

  const checklistQ = useQuery({
    queryKey: ["client-intake", organizationId, clientId],
    queryFn: () =>
      fetchChecklist({
        data: { organization_id: organizationId, client_id: clientId },
      }),
  });

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: ["client-intake", organizationId, clientId],
    });

  const setStatus = useMutation({
    mutationFn: async (v: {
      requirement_id: string;
      status: (typeof STATUSES)[number];
      evidence_document_id?: string | null;
    }) =>
      upsertFn({
        data: {
          organization_id: organizationId,
          client_id: clientId,
          requirement_id: v.requirement_id,
          status: v.status,
          completed_date:
            v.status === "complete"
              ? new Date().toISOString().slice(0, 10)
              : null,
          evidence_document_id: v.evidence_document_id ?? null,
        },
      }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Grouped by category
  const grouped = useMemo(() => {
    const m = new Map<string, NonNullable<typeof checklistQ.data>>();
    for (const r of checklistQ.data ?? []) {
      const k = r.category ?? "Other";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!m.has(k)) m.set(k, [] as any);
      m.get(k)!.push(r);
    }
    return Array.from(m.entries());
  }, [checklistQ.data]);

  // Roll-up: conditional items only count as gaps if status is not 'not_applicable'
  // AND not already 'complete'/'waived'. By default they're 'not_started' so they
  // DO show as open — but they don't shout "missing" the same way required ones
  // do. We separate required-gaps from conditional-pending counts.
  const summary = useMemo(() => {
    let required = 0;
    let complete = 0;
    let openGaps = 0;
    let conditionalPending = 0;
    for (const r of checklistQ.data ?? []) {
      const s = r.completion.status;
      const isCond = !!r.conditional;
      if (!isCond) required += 1;
      if (s === "complete" || s === "waived") {
        complete += 1;
        continue;
      }
      if (s === "not_applicable") continue;
      if (isCond) conditionalPending += 1;
      else openGaps += 1;
    }
    return { required, complete, openGaps, conditionalPending };
  }, [checklistQ.data]);

  if (checklistQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading intake
          checklist…
        </CardContent>
      </Card>
    );
  }
  if (checklistQ.error) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          You don't have access to this client's intake checklist. Only the
          organization admin and staff assigned to {clientName} may view it.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Intake Checklist</CardTitle>
          <p className="text-xs text-muted-foreground">
            Tracks whether each required intake item is on file for {clientName}.
            Items are sourced from your authoritative SOW plus standard intake
            practice (each row carries its citation). Uploading evidence
            pre-fills an item — a human must mark it complete.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <Stat label="Required items" value={String(summary.required)} />
            <Stat label="Complete / waived" value={String(summary.complete)} />
            <Stat
              label="Open required gaps"
              value={String(summary.openGaps)}
              tone={summary.openGaps > 0 ? "warn" : "ok"}
            />
            <Stat
              label="Conditional pending"
              value={String(summary.conditionalPending)}
              tone="muted"
            />
          </div>

          {grouped.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No live base items yet. Confirm the client-intake base in the
              NECTAR approval flow.
            </p>
          )}

          {grouped.map(([cat, rows]) => (
            <div key={cat} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cat}
              </h4>
              <div className="space-y-2">
                {rows.map((row) => (
                  <ChecklistRowView
                    key={row.requirement_id}
                    row={row}
                    onSetStatus={(status) =>
                      setStatus.mutate({
                        requirement_id: row.requirement_id,
                        status,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Evidence storage reuses the existing PHI-gated client documents card
          (nectar_documents, owner_kind=client). To attach a specific upload to
          a checklist item, upload it here and then pick it from the row's
          evidence selector once attachment UI is wired in. */}
      <ClientDocumentsCard clientId={clientId} clientName={clientName} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const color =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-300"
      : tone === "ok"
        ? "text-emerald-700 dark:text-emerald-300"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div className="rounded-md border border-border/60 bg-card/40 p-2">
      <div className={`text-base font-semibold ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function ChecklistRowView({
  row,
  onSetStatus,
}: {
  row: import("@/lib/client-hr.functions").ClientIntakeRow;
  onSetStatus: (status: (typeof STATUSES)[number]) => void;
}) {
  const navigate = useNavigate();
  const status = row.completion.status as (typeof STATUSES)[number];
  const Icon =
    status === "complete" || status === "waived"
      ? CheckCircle2
      : status === "expired"
        ? AlertCircle
        : Circle;
  const iconColor =
    status === "complete" || status === "waived"
      ? "text-emerald-600"
      : status === "expired"
        ? "text-rose-600"
        : "text-muted-foreground";

  return (
    <div className="rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex items-start gap-2">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
          <div className="min-w-0">
            <div className="font-medium">{row.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {row.checklist_layer === "company_required" ? (
                <Badge
                  variant="outline"
                  className="text-[10px] border-indigo-300 text-indigo-700"
                  title="Added by your company as a required intake item. Not derived from an authoritative source."
                >
                  Company-required
                </Badge>
              ) : row.checklist_layer ? (
                <Badge
                  variant="secondary"
                  className="text-[10px]"
                  title={
                    row.checklist_layer === "sow_based"
                      ? "Grounded in your SOW"
                      : "Standard intake practice (not SOW-mandated)"
                  }
                >
                  {row.checklist_layer}
                </Badge>
              ) : null}
              {row.conditional && (
                <Badge variant="outline" className="text-[10px]">
                  conditional · {row.conditional}
                </Badge>
              )}
              {row.evidence_type && <span>evidence: {row.evidence_type}</span>}
              {row.renewal && <span>· renews: {row.renewal}</span>}
              {row.source_citation && <span>· {row.source_citation}</span>}
            </div>
            {row.purpose && row.checklist_layer === "company_required" && (
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                Purpose (company): {row.purpose}
              </p>
            )}
            {row.note && (
              <p className="mt-1 text-[11px] italic text-muted-foreground">
                {row.note}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.completion.evidence_document_id && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() =>
                navigate({
                  to: "/dashboard/nectar-docs",
                  search: { doc: row.completion.evidence_document_id! },
                })
              }
            >
              <FileText className="h-3 w-3" /> Evidence
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          <Select
            value={status}
            onValueChange={(v) => onSetStatus(v as (typeof STATUSES)[number])}
          >
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {row.completion.completed_date && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Marked {STATUS_LABEL[status]} {row.completion.completed_date}
          {row.completion.expires_at &&
            ` · expires ${row.completion.expires_at}`}
        </div>
      )}
    </div>
  );
}
