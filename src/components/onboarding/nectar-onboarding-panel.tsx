import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ClipboardList, Hexagon, Sparkles, X } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { dismissAdminWelcome } from "@/lib/admin-home-welcome.functions";
import { AGENCY_SETUP_PATH, canSkipAgencySetup } from "@/lib/agency-setup-gate";
import { agencySetupQueryKey, useAgencySetup } from "@/hooks/use-agency-setup";

export function NectarOnboardingPanel({ welcomeFlag = false }: { welcomeFlag?: boolean }) {
  const { data: org } = useCurrentOrg();
  const queryClient = useQueryClient();
  const dismissWelcome = useServerFn(dismissAdminWelcome);
  const orgId = org?.organization_id;
  const orgName = org?.organization_name ?? "your agency";
  const { status } = useAgencySetup();

  const [dismissedNow, setDismissedNow] = useState(false);

  const canSkip = canSkipAgencySetup(status);
  const shouldShow = !!orgId && !dismissedNow && (welcomeFlag || !status.complete);

  if (!shouldShow || !orgId) return null;

  const dismiss = () => {
    if (!canSkip) return;
    setDismissedNow(true);
    void dismissWelcome({ data: { organizationId: orgId } })
      .then(() => queryClient.invalidateQueries({ queryKey: agencySetupQueryKey(orgId) }))
      .catch(() => {
        /* already hidden */
      });
  };

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[color:var(--amber-400,var(--hive-gold))]/40 bg-gradient-to-br from-[#0b1733] via-[#0d1a3a] to-[#0b1733] text-amber-50 shadow-xl"
      aria-label="Agency setup"
      data-testid="agency-setup-panel"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 opacity-20">
        <Hexagon
          className="h-56 w-56 text-[color:var(--amber-400,var(--hive-gold))]"
          strokeWidth={1}
        />
      </div>

      <div className="relative flex flex-col gap-4 border-b border-amber-300/15 px-5 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--amber-500,var(--hive-gold))] text-[#0b1733]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--amber-400,var(--hive-gold))]">
                NECTAR · Agency setup
              </div>
              <h2 className="font-display text-xl font-semibold tracking-tight text-amber-50 sm:text-2xl">
                {status.complete ? "Operating facts are on file." : `Tell me about ${orgName}.`}
              </h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={dismiss}
            disabled={!canSkip}
            data-testid="agency-setup-skip"
            className="shrink-0 text-amber-100 hover:bg-white/10 hover:text-amber-50 disabled:opacity-40"
          >
            {status.complete ? <X className="h-4 w-4" /> : "Skip"}
          </Button>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-amber-100/90">
          {status.complete
            ? "Staff and client records can be added now. Statewide requirements stay in Provider Interface — you do not upload a Scope of Work to finish setup."
            : "Answer the required operating questions before adding staff or clients. Skip stays off until every required fact is saved. Statewide requirements are already in Provider Interface — you do not upload a Scope of Work to finish setup."}
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-amber-200/80">
            <span>Setup progress</span>
            <span data-testid="agency-setup-progress">{status.progressLabel} complete</span>
          </div>
          <Progress
            value={(status.answeredCount / status.requiredCount) * 100}
            className="h-2 bg-white/10 [&>div]:bg-[color:var(--amber-400,var(--hive-gold))]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            className="bg-[color:var(--amber-500,var(--hive-gold))] text-[#0b1733] hover:bg-[color:var(--amber-400,var(--hive-gold))]"
          >
            <Link to={AGENCY_SETUP_PATH}>
              <ClipboardList className="mr-1 h-4 w-4" />
              {status.complete ? "Review agency setup" : "Continue agency setup"}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          {!canSkip ? (
            <p className="text-xs text-amber-100/80">
              Skip is disabled until all required operating questions are answered.
            </p>
          ) : (
            <Button
              variant="ghost"
              onClick={dismiss}
              className="text-amber-100 hover:bg-white/10 hover:text-amber-50"
            >
              Dismiss and go to dashboard
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
