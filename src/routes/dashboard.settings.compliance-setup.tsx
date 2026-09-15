import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { UnansweredFactsCard } from "@/components/obligations/unanswered-facts-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { listUnansweredFacts, type OrgFacts } from "@/lib/obligations/applicability";
import {
  AGENCY_SETUP_QUESTIONS,
  activeSectionCodeCallouts,
  agencyAnswerContext,
  agencySetupFactValue,
  agencySetupQuestionsBySection,
  isQuestionRequired,
  type AgencyAnswerContext,
  type AgencySetupQuestionDefinition,
} from "@/lib/agency-setup-gate";
import { persistAgencySetupFacts } from "@/lib/agency-setup-gate.functions";
import { agencySetupQueryKey, useAgencySetup } from "@/hooks/use-agency-setup";
import {
  ComplianceAnswerField,
  type ComplianceAnswerValue,
} from "@/components/compliance/compliance-answer-field";
import { DEFERRED_FACTS } from "@/lib/obligations/deferred-setup-facts";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/settings/compliance-setup")({
  head: () => ({ meta: [{ title: "Agency setup — Provider Interface" }] }),
  validateSearch: (s: Record<string, unknown>): { reason?: string } => ({
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  component: ComplianceSetupPage,
});

type Draft = Record<string, ComplianceAnswerValue>;

function draftFromFacts(): Draft {
  const draft: Draft = {};
  for (const q of AGENCY_SETUP_QUESTIONS) {
    draft[q.factKey] = null;
  }
  return draft;
}

function hydrateDraft(facts: Parameters<typeof agencySetupFactValue>[1]): Draft {
  const draft = draftFromFacts();
  for (const q of AGENCY_SETUP_QUESTIONS) {
    const value = agencySetupFactValue(q.factKey, facts);
    draft[q.factKey] = (value ?? null) as ComplianceAnswerValue;
  }
  return draft;
}

function answerToPersistPayload(draft: Draft) {
  const get = (key: string) => draft[key] ?? null;
  const awarded = get("awarded_service_codes");
  return {
    operates_ol_site: get("operates_ol_site") as boolean | null,
    uses_volunteers: get("uses_volunteers") as boolean | null,
    has_governing_board: get("has_governing_board") as boolean | null,
    servicesOffered: Array.isArray(awarded) ? (awarded as string[]) : [],
    approxClientCount: get("approx_client_count") as number | null,
    serviceArea: get("service_area") as string | null,
    dhhsProviderId: get("dhhs_provider_id") as string | null,
    seiAwardDate: get("sei_award_date") as string | null,
    providesRespiteOvernight: get("fact_provides_respite_overnight") as boolean | null,
    isUsorVendor: get("fact_is_usor_vendor") as boolean | null,
    supportsSelfAdministeredMedication: get("fact_supports_self_administered_medication") as
      | boolean
      | null,
    actsAsRepresentativePayee: get("fact_acts_as_representative_payee") as boolean | null,
    providesTransportation: get("fact_provides_transportation") as boolean | null,
    communityProgramTotalPersonsServed: get("community_program_total_persons_served") as
      | number
      | null,
  };
}

function isAnswered(q: AgencySetupQuestionDefinition, value: ComplianceAnswerValue): boolean {
  if (q.answerType === "multi_select") return Array.isArray(value) && value.length > 0;
  if (q.answerType === "text" || q.answerType === "date") {
    return typeof value === "string" && value.trim().length > 0;
  }
  if (q.answerType === "number") return typeof value === "number" && Number.isFinite(value);
  if (q.answerType === "boolean") return value === true || value === false;
  return value !== null && value !== undefined;
}

function ComplianceSetupPage() {
  const { data: org } = useCurrentOrg();
  if (!org) {
    return (
      <div className="max-w-3xl space-y-4">
        <p className="text-sm text-muted-foreground">Select an organization to continue.</p>
      </div>
    );
  }
  // Remount the whole form on org switch so no draft state carries between organizations.
  return (
    <ComplianceSetupForOrg
      key={org.organization_id}
      organizationId={org.organization_id}
      role={org.role}
    />
  );
}

function ComplianceSetupForOrg({
  organizationId,
  role,
}: {
  organizationId: string;
  role: string | null;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const search = useSearch({ strict: false }) as { reason?: string };
  const navigate = useNavigate();
  const persistFacts = useServerFn(persistAgencySetupFacts);
  const { facts, status, isLoading } = useAgencySetup();
  const canEdit = role === "admin" || role === "program_manager" || role === "manager";

  const [draft, setDraft] = useState<Draft>(() => draftFromFacts());
  const [hydrated, setHydrated] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isLoading || hydrated) return;
    setDraft(hydrateDraft(facts));
    setHydrated(true);
  }, [isLoading, hydrated, facts]);

  const ctx: AgencyAnswerContext = useMemo(
    () => agencyAnswerContext({ servicesOffered: (draft.awarded_service_codes as string[]) ?? [] }),
    [draft.awarded_service_codes],
  );

  const sections = useMemo(() => agencySetupQuestionsBySection(ctx), [ctx]);
  const callouts = useMemo(() => activeSectionCodeCallouts(ctx), [ctx]);

  const requiredVisible = useMemo(
    () => AGENCY_SETUP_QUESTIONS.filter((q) => isQuestionRequired(q, ctx)),
    [ctx],
  );
  const missing = useMemo(
    () => requiredVisible.filter((q) => !isAnswered(q, draft[q.factKey] ?? null)),
    [requiredVisible, draft],
  );
  const answeredCount = requiredVisible.length - missing.length;
  const readyToFinish = missing.length === 0;

  const save = useMutation({
    mutationFn: async (finish: boolean) => {
      if (!user?.id) throw new Error("Not signed in.");
      const result = await persistFacts({
        data: { organizationId, ...answerToPersistPayload(draft) },
      });
      return { result, finish };
    },
    onSuccess: async ({ finish }) => {
      await qc.invalidateQueries({ queryKey: agencySetupQueryKey(organizationId) });
      if (finish) {
        toast.success("Agency setup complete. Staff and client records are unlocked.");
        void navigate({ to: "/dashboard" });
      } else {
        toast.success("Draft saved. Come back any time — nothing is lost.");
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not save agency setup");
    },
  });

  if (!hydrated || isLoading) {
    return <p className="max-w-3xl text-sm text-muted-foreground">Loading setup facts…</p>;
  }

  const orgFactsForCard: OrgFacts = {
    operates_ol_site: draft.operates_ol_site as boolean | null,
    uses_volunteers: draft.uses_volunteers as boolean | null,
    has_governing_board: draft.has_governing_board as boolean | null,
    servicesOffered: (draft.awarded_service_codes as string[]) ?? [],
  };
  const unanswered = listUnansweredFacts(orgFactsForCard);

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <Link
        to="/dashboard/settings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> Settings
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ClipboardList className="h-5 w-5" /> Agency setup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer the operating questions below once, right after signup — before adding your first
          staff member or client. Your answers automatically configure which compliance requirements
          apply to your agency. Save draft any time; nothing is lost between visits or logins.
        </p>
      </div>

      {search.reason === "setup_incomplete" ? (
        <div
          data-testid="setup-redirect-reason"
          className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Staff and client screens stay closed until required operating questions are answered.
          Finish setup is disabled at {answeredCount} of {requiredVisible.length}.
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <span>Setup progress</span>
          <span>
            {answeredCount} of {requiredVisible.length} required questions answered
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{
              width: `${requiredVisible.length === 0 ? 100 : Math.round((answeredCount / requiredVisible.length) * 100)}%`,
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Progress counts only questions that currently apply to you — answering the services
          question can add or remove questions below.
        </p>
      </div>

      <UnansweredFactsCard unanswered={unanswered} showSetupLink={false} />

      {!canEdit ? (
        <p className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Only owners, program managers, and supervisors can change these answers.
        </p>
      ) : null}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {sections.map(({ section, label, questions }) => (
          <section
            key={section}
            className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
          >
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))}
              className="flex w-full items-center justify-between text-left"
            >
              <h2 className="text-base font-semibold">{label}</h2>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${collapsed[section] ? "-rotate-90" : ""}`}
              />
            </button>

            {!collapsed[section] ? (
              <div className="space-y-5">
                {callouts
                  .filter((c) => c.section === section)
                  .map((c) => (
                    <div
                      key={c.id}
                      className="flex gap-3 rounded-xl border border-sky-300/50 bg-sky-50 p-3 text-sm text-sky-950"
                    >
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-medium">{c.title}</p>
                        <p className="mt-1 text-sky-900">{c.body}</p>
                        {c.linkTo ? (
                          <Link
                            to={c.linkTo}
                            className="mt-1 inline-block text-sm font-medium underline"
                          >
                            {c.linkLabel ?? "Open"}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  ))}

                {questions.map((q) => {
                  const required = isQuestionRequired(q, ctx);
                  const answered = isAnswered(q, draft[q.factKey] ?? null);
                  return (
                    <fieldset key={q.id} className="space-y-2">
                      <legend className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {q.question}
                        {required ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            (required)
                          </span>
                        ) : null}
                        {answered ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                        ) : null}
                      </legend>
                      {q.help ? <p className="text-xs text-muted-foreground">{q.help}</p> : null}
                      {q.whyItMatters ? (
                        <p className="text-xs italic text-muted-foreground">
                          Why it matters: {q.whyItMatters}
                        </p>
                      ) : null}
                      <ComplianceAnswerField
                        question={q}
                        value={draft[q.factKey] ?? null}
                        disabled={!canEdit}
                        onChange={(next) => setDraft((prev) => ({ ...prev, [q.factKey]: next }))}
                      />
                      {showMissing && required && !answered ? (
                        <p className="text-xs font-medium text-destructive">
                          This is required to finish setup.
                        </p>
                      ) : null}
                    </fieldset>
                  );
                })}
              </div>
            ) : null}
          </section>
        ))}

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
            >
              {save.isPending ? "Saving…" : "Save draft"}
            </Button>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => {
                if (!readyToFinish) {
                  setShowMissing(true);
                  toast.error(
                    `${missing.length} required question${missing.length === 1 ? "" : "s"} still need an answer.`,
                  );
                  return;
                }
                save.mutate(true);
              }}
            >
              {save.isPending ? "Saving…" : "Finish setup"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Save draft keeps your progress without requiring everything to be answered. Finish
              setup unlocks staff and client records.
            </p>
          </div>
        ) : null}
      </form>

      <SetupSummary ctx={ctx} draft={draft} />
    </div>
  );
}

function SetupSummary({ ctx, draft }: { ctx: AgencyAnswerContext; draft: Draft }) {
  const deferredByRecord = useMemo(() => {
    const counts = { location_record: 0, staff_record: 0, client_record: 0, assignment_record: 0 };
    for (const f of DEFERRED_FACTS) counts[f.deferredTo] += 1;
    return counts;
  }, []);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-sm font-semibold">Summary</h2>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Awarded services
        </h3>
        <p className="mt-1 text-sm">
          {ctx.awardedCodes.length ? ctx.awardedCodes.join(", ") : "Not yet recorded."}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Locations & licensing
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.operates_ol_site === true
            ? "You operate at least one OL-licensed or certified site. Add each home or site under Homes & Teams to record its license, capacity, and zoning details."
            : draft.operates_ol_site === false
              ? "No OL-licensed or certified site recorded."
              : "Not yet answered."}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Responsibilities this unlocks
        </h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            {deferredByRecord.client_record} questions become available on each client's record as
            you add clients.
          </li>
          <li>
            {deferredByRecord.staff_record} questions become available on each staff record as you
            hire.
          </li>
          <li>
            {deferredByRecord.location_record} questions become available on each home/site as you
            add locations.
          </li>
          <li>
            {deferredByRecord.assignment_record} question becomes available when you assign a staff
            member to a client.
          </li>
        </ul>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Unresolved information
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Every unanswered required question above stays visible until it is recorded — HIVE never
          assumes "no" or "not applicable" for you. Once you award a new service code, configure its
          billing and scheduling details under Settings → Service codes.
        </p>
      </div>
    </section>
  );
}
