import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { UnansweredFactsCard } from "@/components/obligations/unanswered-facts-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { resolveCatalogExceptions } from "@/lib/obligations/catalog-exceptions";
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
import {
  AWARDED_CODE_CHOICES,
  LIVE_PATH_SETUP_QUESTIONS,
} from "@/lib/obligations/setup-facts";
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
      const loaded = await loadOrgFacts(supabase as any, orgId);
      return loaded ?? EMPTY_ORG_FACTS;
    },
  });

  const [draft, setDraft] = useState<PersistOrgFactsInput>({
    operates_ol_site: null,
    uses_volunteers: null,
    has_governing_board: null,
    servicesOffered: [],
  });

  useEffect(() => {
    if (!factsQuery.data) return;
    setDraft({
      operates_ol_site: factsQuery.data.operates_ol_site,
      uses_volunteers: factsQuery.data.uses_volunteers,
      has_governing_board: factsQuery.data.has_governing_board,
      servicesOffered: factsQuery.data.servicesOffered,
    });
  }, [factsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId || !user?.id) throw new Error("No organization selected.");
      return persistOrgFacts(supabase as any, orgId, user.id, draft);
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
    operates_ol_site: draft.operates_ol_site,
    uses_volunteers: draft.uses_volunteers,
    has_governing_board: draft.has_governing_board,
    servicesOffered: draft.servicesOffered ?? [],
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
          Record awarded service codes and operational facts. Questions are concrete — never whether
          a SOW article applies. Unanswered facts stay unanswered and keep those rows visible.
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
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Which DSPD service codes is this contractor awarded?
            </legend>
            <p className="text-xs text-muted-foreground">
              Same codes as the company profile. Leave empty until known — empty is unanswered, not
              N/A. Extra codes already stored stay listed.
            </p>
            <div className="flex flex-wrap gap-2">
              {Array.from(
                new Set([
                  ...AWARDED_CODE_CHOICES,
                  ...(draft.servicesOffered ?? []).map((c) => c.toUpperCase()),
                ]),
              ).map((code) => {
                const selected = (draft.servicesOffered ?? []).includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={selected}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      selected
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-background text-muted-foreground"
                    }`}
                    onClick={() =>
                      setDraft((prev) => {
                        const current = prev.servicesOffered ?? [];
                        return {
                          ...prev,
                          servicesOffered: selected
                            ? current.filter((c) => c !== code)
                            : [...current, code],
                        };
                      })
                    }
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </fieldset>

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
          Awarded codes{" "}
          {merged.servicesOffered.length
            ? merged.servicesOffered.join(", ")
            : "are unanswered"}.
          Empty codes keep code-gated rows visible until recorded.
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

      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-sm font-semibold">Live paths on the current catalog</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Each path uses a concrete fact the engine already reads. Exceptions are on the catalog
          record. SOW CSV import is still deferred.
        </p>
        <ul className="mt-4 space-y-3">
          {LIVE_PATH_SETUP_QUESTIONS.map((path) => {
            const flags = path.dutyKeys.map((key) => ({
              key,
              ...resolveCatalogExceptions(key),
            }));
            const labels = [
              flags.some((f) => f.nonwaivable) ? "Nonwaivable" : null,
              flags.some((f) => f.sei_only) ? "SEI-only" : null,
              flags.some((f) => f.assignment_gated) ? "Assignment-gated" : null,
            ].filter(Boolean);
            return (
              <li key={path.path} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium">{path.question}</p>
                <p className="mt-1 text-xs text-muted-foreground">{path.help}</p>
                {labels.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{labels.join(" · ")}</p>
                ) : null}
                {path.ownerAnswers ? (
                  <p className="mt-1 text-xs text-muted-foreground">Recorded on this page.</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Read from live assignments, person records, or 1056 authorizations.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
