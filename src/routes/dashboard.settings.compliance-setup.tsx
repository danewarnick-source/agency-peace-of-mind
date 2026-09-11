import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { UnansweredFactsCard } from "@/components/obligations/unanswered-facts-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_ORG_FACTS,
  ORG_FACT_DEFINITIONS,
  computeObligationApplicability,
  listUnansweredFacts,
  loadOrgFacts,
  persistOrgFacts,
  type FactAnswer,
  type OrgFacts,
  type PersistOrgFactsInput,
} from "@/lib/obligations/applicability";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/compliance-setup")({
  head: () => ({ meta: [{ title: "Compliance setup — Provider Interface" }] }),
  component: ComplianceSetupPage,
});

const FACT_CHOICES: Array<{ value: FactAnswer; label: string }> = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
  { value: null, label: "Not yet answered" },
];

function ComplianceSetupPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id ?? null;
  const canEdit =
    org?.role === "admin" || org?.role === "program_manager" || org?.role === "manager";

  const factsQuery = useQuery({
    queryKey: ["org-compliance-facts", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return EMPTY_ORG_FACTS;
      const loaded = await loadOrgFacts(supabase, orgId);
      return loaded ?? EMPTY_ORG_FACTS;
    },
  });

  const [draft, setDraft] = useState<PersistOrgFactsInput>({
    operates_ol_site: null,
    uses_volunteers: null,
    has_governing_board: null,
  });

  useEffect(() => {
    if (!factsQuery.data) return;
    setDraft({
      operates_ol_site: factsQuery.data.operates_ol_site,
      uses_volunteers: factsQuery.data.uses_volunteers,
      has_governing_board: factsQuery.data.has_governing_board,
    });
  }, [factsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error("No organization selected.");
      return persistOrgFacts(supabase, orgId, user.id, draft);
    },
    onSuccess: async () => {
      toast.success("Compliance setup saved");
      await qc.invalidateQueries({ queryKey: ["org-compliance-facts", orgId] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save compliance setup");
    },
  });

  if (!org) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Select an organization to continue.</p>
      </div>
    );
  }

  const merged: OrgFacts = {
    ...(factsQuery.data ?? EMPTY_ORG_FACTS),
    ...draft,
  };
  const unanswered = listUnansweredFacts(merged);
  const preview = computeObligationApplicability(merged);
  const visible = preview.filter((row) => row.applies);
  const hidden = preview.filter((row) => !row.applies);

  return (
    <div className="max-w-3xl space-y-6">
      <Link
        to="/dashboard/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Settings
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ClipboardList className="h-5 w-5" /> Compliance setup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record operational facts so conditional SOW duties apply only when they should. Unanswered
          facts keep those rows visible on the register.
        </p>
      </div>

      <UnansweredFactsCard unanswered={unanswered} showSetupLink={false} />

      {factsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading setup facts…</p>
      ) : factsQuery.isError ? (
        <p className="text-sm text-muted-foreground">
          Could not load setup facts. If Soft Core has not applied the Step 5 SQL yet, columns will
          appear after that paste.
        </p>
      ) : (
        <form
          className="space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canEdit) return;
            save.mutate();
          }}
        >
          {ORG_FACT_DEFINITIONS.map((def) => (
            <fieldset key={def.key} className="space-y-2">
              <legend className="text-sm font-medium">{def.question}</legend>
              <p className="text-xs text-muted-foreground">{def.help}</p>
              <div className="flex flex-wrap gap-2">
                {FACT_CHOICES.map((choice) => {
                  const selected = draft[def.key] === choice.value;
                  return (
                    <button
                      key={String(choice.value)}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={selected}
                      className={`rounded-md border px-3 py-1.5 text-sm ${
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground"
                      }`}
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          [def.key]: choice.value,
                        }))
                      }
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {canEdit ? (
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save setup facts"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Only owners, program managers, and supervisors can change these facts.
            </p>
          )}
        </form>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold">What this means for the register</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Service-code hides are separate. These rows follow the facts above plus awarded services (
          {merged.servicesOffered.length ? merged.servicesOffered.join(", ") : "none recorded"}).
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Stay visible
            </h3>
            <ul className="mt-2 space-y-1 text-sm">
              {visible.map((row) => (
                <li key={row.obligationKey}>
                  {row.title}
                  {row.unanswered ? " (until answered)" : ""}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Do not apply
            </h3>
            {hidden.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {hidden.map((row) => (
                  <li key={row.obligationKey}>{row.title}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
