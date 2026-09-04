/**
 * Admin Home — first-login guided checklist.
 *
 * Progress + next-step CTAs. Not a Nectar chat home. Not a compliance dump.
 */
import { Suspense, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Check, Contact2, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import { PiMark } from "@/components/pi-landing/pi-mark";
import { PI_ACTION, PI_CREAM, PI_GOLD, PI_NAVY } from "@/lib/pi-landing";
import {
  ADMIN_HOME_OBLIGATIONS_QUIET,
  adminHomeHeadline,
  adminHomeProgressLine,
  adminHomeSetupProgress,
  adminHomeSetupQueryKey,
  adminHomeSupport,
  buildAdminHomeSetupSteps,
  EMPTY_ADMIN_HOME_SETUP_COUNTS,
  formatDenverLongDate,
  greetingWord,
  sessionFirstName,
  type AdminHomeSetupCounts,
  type AdminHomeSetupStep,
  type AdminHomeSetupStepId,
} from "@/lib/admin-home-setup";
import { cn } from "@/lib/utils";

function countOrZero(result: { count: number | null; error: { message?: string } | null }): number {
  if (result.error) return 0;
  return result.count ?? 0;
}

async function fetchAdminHomeSetup(orgId: string): Promise<AdminHomeSetupCounts> {
  const [members, invites, clients, shifts] = await Promise.all([
    (supabase as any)
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("active", true),
    (supabase as any)
      .from("invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "pending"),
    (supabase as any)
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
    (supabase as any)
      .from("scheduled_shifts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  if (members.error) throw members.error;

  return {
    memberCount: members.count ?? 0,
    pendingInviteCount: countOrZero(invites),
    clientCount: countOrZero(clients),
    shiftCount: countOrZero(shifts),
  };
}

function stepIcon(id: AdminHomeSetupStepId) {
  if (id === "staff") return Users;
  if (id === "client") return Contact2;
  return CalendarDays;
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-white/10", className)} />;
}

function AdminHomeDashboardInner() {
  const { user } = useAuth();
  const { data: org, isLoading: orgLoading } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const orgName = org?.organization_name ?? "Your agency";

  const setupQ = useQuery({
    enabled: !!orgId,
    queryKey: adminHomeSetupQueryKey(orgId),
    queryFn: () => fetchAdminHomeSetup(orgId!),
    staleTime: 15_000,
  });

  const now = useMemo(() => new Date(), []);
  const counts = setupQ.data ?? EMPTY_ADMIN_HOME_SETUP_COUNTS;
  const steps = useMemo(() => buildAdminHomeSetupSteps(counts), [counts]);
  const progress = useMemo(() => adminHomeSetupProgress(steps), [steps]);

  if (!orgId && !orgLoading) return null;

  const firstName = sessionFirstName(user);
  const dateLine = formatDenverLongDate(now);
  const setupReady = setupQ.isSuccess;
  const setupFailed = setupQ.isError;
  const setupLoading = !setupReady && !setupFailed;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <section
        className="overflow-hidden rounded-2xl px-6 py-8 sm:px-8 sm:py-10"
        style={{ background: PI_NAVY, color: PI_CREAM }}
        aria-label="Home setup"
      >
        <div className="flex items-center gap-3 text-[#f3efe6]/70">
          <PiMark className="h-6 w-6 text-[#f3efe6]" title="Provider Interface" />
          <span className="font-sans text-[11px] font-medium uppercase tracking-[0.22em]">
            Provider Interface
          </span>
        </div>

        <h1 className="mt-6 font-sans text-[1.75rem] font-semibold leading-tight tracking-tight sm:text-[2.15rem]">
          Good {greetingWord(now)}, {firstName}.
        </h1>
        <p className="mt-2 font-sans text-xl font-medium tracking-tight text-[#f3efe6] sm:text-2xl">
          {setupLoading ? "The office is open." : adminHomeHeadline(progress.allComplete)}
        </p>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#f3efe6]/70">
          {org ? `${orgName} · ${dateLine}` : dateLine}
        </p>

        <div className="mt-8">
          {setupLoading ? (
            <div className="space-y-3" aria-hidden>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-1.5 w-full" />
            </div>
          ) : setupFailed ? (
            <p className="text-sm text-[#f3efe6]/70">Could not load setup progress.</p>
          ) : (
            <>
              <p
                className="font-sans text-lg font-medium tracking-tight"
                data-testid="admin-home-progress"
              >
                {adminHomeProgressLine(progress.done, progress.total)}
              </p>
              <p className="mt-1 text-sm text-[#f3efe6]/65">{adminHomeSupport(progress.allComplete)}</p>
              <div
                className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label={adminHomeProgressLine(progress.done, progress.total)}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%`,
                    background: PI_GOLD,
                  }}
                />
              </div>
            </>
          )}
        </div>

        <p className="mt-6 max-w-xl text-[13px] leading-relaxed text-[#f3efe6]/48">
          {ADMIN_HOME_OBLIGATIONS_QUIET}
        </p>
      </section>

      {setupLoading ? (
        <div className="space-y-3" aria-hidden>
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
          <Skeleton className="h-28 w-full rounded-2xl bg-muted" />
        </div>
      ) : setupFailed ? (
        <p className="text-sm text-muted-foreground">Try Home again in a moment.</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <SetupStepCard
              key={step.id}
              step={step}
              index={index}
              isNext={progress.nextId === step.id}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function SetupStepCard({
  step,
  index,
  isNext,
}: {
  step: AdminHomeSetupStep;
  index: number;
  isNext: boolean;
}) {
  const Icon = stepIcon(step.id);
  return (
    <li
      className={cn(
        "rounded-2xl border bg-card px-5 py-5 shadow-[var(--shadow-card)]",
        isNext ? "border-[#0b1220]/20" : "border-border",
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            step.done
              ? "bg-[var(--hive-ok-soft)] text-[var(--hive-ok-fg)]"
              : isNext
                ? "text-[#f3efe6]"
                : "bg-muted text-muted-foreground",
          )}
          style={isNext && !step.done ? { background: PI_NAVY } : undefined}
          aria-hidden
        >
          {step.done ? <Check className="h-4 w-4" strokeWidth={2.2} /> : index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-sans text-base font-semibold tracking-tight text-foreground">
              {step.title}
            </h2>
            {isNext && !step.done ? (
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Next
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

          <div className="mt-4">
            {step.done ? (
              <Link
                to={step.href}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                <Icon className="h-3.5 w-3.5" />
                {step.doneLabel}
              </Link>
            ) : (
              <Link
                to={step.href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition",
                  isNext
                    ? "hover:opacity-95"
                    : "border border-border bg-background text-foreground hover:bg-muted/60",
                )}
                style={isNext ? { background: PI_ACTION, color: PI_CREAM } : undefined}
              >
                {step.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function HomeFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div
        className="rounded-2xl px-6 py-8 sm:px-8 sm:py-10"
        style={{ background: PI_NAVY, color: PI_CREAM }}
      >
        <div className="text-lg font-semibold">Good day</div>
        <div className="mt-1 text-sm text-[#f3efe6]/65">Loading workspace…</div>
      </div>
    </div>
  );
}

export function AdminHomeDashboard() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <AdminHomeDashboardInner />
    </Suspense>
  );
}
