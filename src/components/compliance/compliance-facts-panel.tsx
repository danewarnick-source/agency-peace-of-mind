import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, HelpCircle, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  ComplianceAnswerField,
  type ComplianceAnswerValue,
} from "@/components/compliance/compliance-answer-field";
import {
  deferredFact,
  deferredFactsForRecord,
  type DeferredRecordKind,
} from "@/lib/obligations/deferred-setup-facts";
import { toast } from "sonner";

export type ComplianceFactScope = "location" | "staff" | "client" | "assignment";

const RECORD_KIND_BY_SCOPE: Record<ComplianceFactScope, DeferredRecordKind> = {
  location: "location_record",
  staff: "staff_record",
  client: "client_record",
  assignment: "assignment_record",
};

type FactAnswerStatus = "unanswered" | "answered" | "unknown" | "not_applicable";

type FactAnswerRow = {
  fact_key: string;
  status: FactAnswerStatus;
  value: unknown;
};

/**
 * The compliance facts a staff/client/location/assignment record still owes
 * — a visible information task, never a silent "does not apply". Facts
 * already answered through an existing field (has_abi, guardian_name, the
 * transport-assignment live path, …) show as read-only pointers, not a
 * second control that could drift from the real source.
 */
export function ComplianceFactsPanel({
  scope,
  entityId,
  organizationId,
  canEdit,
  title = "Compliance facts",
  reevaluate,
}: {
  scope: ComplianceFactScope;
  entityId: string;
  organizationId: string;
  canEdit: boolean;
  title?: string;
  /**
   * Fired after a successful save, before the answer is treated as final —
   * wires this scope's answer changes into the existing duty-reevaluation
   * mechanism (onClientDutyFactsChanged / onStaffDutyFactsChanged). Optional
   * because not every scope has a reevaluation target yet: "location" has no
   * duty-reevaluation concept in this codebase, so its mounts correctly omit
   * this prop rather than call something that doesn't exist. A save still
   * succeeds if this rejects — reevaluation failure must never block the
   * fact from being recorded — but the error is surfaced so a silent gap
   * doesn't look like a clean save.
   */
  reevaluate?: () => Promise<unknown>;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, ComplianceAnswerValue>>({});

  const facts = useMemo(() => deferredFactsForRecord(RECORD_KIND_BY_SCOPE[scope]), [scope]);
  // A fact with duplicateOf (e.g. FACT-058/FACT-079, both the same
  // real-world question as FACT-018) is never independently editable, even
  // when its own storage is "generic" — otherwise near-duplicate questions
  // could be answered inconsistently with each other. It still needs
  // *some* fact_key to save under; it always saves as its duplicate
  // target's factId, so all three read and write the exact same row.
  const generic = useMemo(
    () => facts.filter((f) => f.storage.kind === "generic" && !f.duplicateOf),
    [facts],
  );
  const informational = useMemo(
    () => facts.filter((f) => f.storage.kind !== "generic" || f.duplicateOf),
    [facts],
  );

  const queryKey = ["compliance-fact-answers", organizationId, scope, entityId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    enabled: !!organizationId && !!entityId && generic.length > 0,
    queryFn: async (): Promise<FactAnswerRow[]> => {
      const { data, error } = await supabase
        .from("compliance_fact_answers")
        .select("fact_key, status, value")
        .eq("organization_id", organizationId)
        .eq("scope", scope)
        .eq("entity_id", entityId);
      if (error) throw error;
      return (data ?? []) as FactAnswerRow[];
    },
  });

  const byKey = useMemo(() => new Map(rows.map((r) => [r.fact_key, r])), [rows]);

  const save = useMutation({
    mutationFn: async ({
      factKey,
      status,
      value,
    }: {
      factKey: string;
      status: FactAnswerStatus;
      value: ComplianceAnswerValue;
    }) => {
      if (!user?.id) throw new Error("Not signed in.");
      const { error } = await supabase.from("compliance_fact_answers").upsert(
        {
          organization_id: organizationId,
          scope,
          entity_id: entityId,
          fact_key: factKey,
          status,
          value: value === null ? null : (value as never),
          source: "manual",
          answered_by: user.id,
          answered_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,scope,entity_id,fact_key" },
      );
      if (error) throw error;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey });
      if (!reevaluate) return;
      try {
        await reevaluate();
      } catch (err) {
        // The answer is already saved — a reevaluation failure must not
        // look like the save failed, but it also must not be silent.
        toast.error(
          err instanceof Error
            ? `Saved, but reevaluation failed: ${err.message}`
            : "Saved, but reevaluation failed.",
        );
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save this answer");
    },
  });

  if (facts.length === 0) return null;

  const unansweredCount = generic.filter(
    (f) => (byKey.get(f.factId)?.status ?? "unanswered") === "unanswered",
  ).length;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          These questions became available once this record was created — they could not be asked
          during agency setup.
          {unansweredCount > 0 ? ` ${unansweredCount} still need an answer.` : " All answered."}
        </p>
      </div>

      {isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : null}

      <div className="space-y-4">
        {generic.map((f) => {
          const row = byKey.get(f.factId);
          const status = row?.status ?? "unanswered";
          const currentValue =
            drafts[f.factId] !== undefined
              ? drafts[f.factId]
              : ((row?.value ?? null) as ComplianceAnswerValue);
          return (
            <div
              key={f.factId}
              className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {f.question}
                {status === "answered" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : null}
                {status === "unknown" ? (
                  <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
                ) : null}
              </div>
              {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <ComplianceAnswerField
                  question={f}
                  value={currentValue}
                  disabled={!canEdit || save.isPending}
                  onChange={(next) => setDrafts((prev) => ({ ...prev, [f.factId]: next }))}
                />
                {canEdit ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({ factKey: f.factId, status: "answered", value: currentValue })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({ factKey: f.factId, status: "unknown", value: null })
                      }
                    >
                      I don't know
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {informational.length > 0 ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Already tracked elsewhere on this record
          </p>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {informational.map((f) => (
              <li key={f.factId} className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="text-foreground">{f.question}</strong>{" "}
                  {f.duplicateOf
                    ? `Same question as one already answered above — see "${
                        deferredFact(f.duplicateOf)?.question ?? f.duplicateOf
                      }".`
                    : f.storage.kind === "existing_mechanism" || f.storage.kind === "derived"
                      ? f.storage.description
                      : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
