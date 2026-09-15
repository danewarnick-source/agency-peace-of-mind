/**
 * Admin Home — decisions this week, not escalation tiles.
 * Welcome banner (AdminHomeWelcome) sits above the greeting.
 */
import { Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { greetingWord, useAdminHomeData } from "@/components/admin-home/use-admin-home-data";
import { AdminHomeWelcome } from "@/components/admin-home/admin-home-welcome";
import { NectarOnboardingPanel } from "@/components/onboarding/nectar-onboarding-panel";
import { ThisWeekPlanCards } from "@/components/compliance/this-week-plan-cards";
import { generateMyReview, getReviewDayMeta, listPackWhatChanged } from "@/lib/obligations/review-pack.functions";
import {
  formatReviewDayMeta,
  isHumanPackNote,
  showWhatChangedTab,
  whatChangedTitle,
  type ReviewDayMeta,
} from "@/lib/obligations/review-pack";
import { PACK_VERSION } from "@/lib/sow-obligation-catalog-pack";
import { isAdminLevelRole } from "@/lib/obligations/escalation";
import "@/components/compliance/decision-card.css";
import "./admin-home-decisions.css";

type HomeTab = "this-week" | "review-day" | "what-changed";

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

function ReviewDayPanel({ orgId }: { orgId: string }) {
  const generate = useServerFn(generateMyReview);
  const loadMeta = useServerFn(getReviewDayMeta);
  const mut = useMutation({
    mutationFn: () => generate({ data: { organizationId: orgId } }),
  });
  const metaQ = useQuery({
    enabled: !!orgId,
    queryKey: ["review-day-meta", orgId],
    queryFn: () => loadMeta({ data: { organizationId: orgId } }),
    staleTime: 60_000,
  });
  const reviewText =
    mut.data?.text ??
    (mut.data as { result?: { text?: string } } | undefined)?.result?.text ??
    "";
  const metaPayload = metaQ.data as ReviewDayMeta | { result?: ReviewDayMeta } | undefined;
  const meta = metaPayload && "period" in metaPayload ? metaPayload : metaPayload?.result;
  const metaLine = meta ? formatReviewDayMeta(meta) : null;

  return (
    <section data-testid="review-day" className="space-y-4">
      <h2 className="text-[22px] font-semibold leading-tight text-foreground">Review day</h2>
      <p className="text-sm text-muted-foreground">
        Draft a DSPD review from this week. A human must attest. Nothing publishes itself.
      </p>
      {metaLine ? (
        <p data-testid="review-day-meta" className="text-sm text-muted-foreground">
          {metaLine}
        </p>
      ) : null}
      <button type="button" className="act-btn hive-gold-btn" onClick={() => mut.mutate()}>
        Generate my DSPD review
      </button>
      {mut.isPending ? <p className="text-sm text-muted-foreground">Generating draft.</p> : null}
      {mut.isError ? (
        <p className="text-sm text-muted-foreground">Could not generate the review.</p>
      ) : null}
      {reviewText ? (
        <pre
          data-testid="review-pack-text"
          className="whitespace-pre-wrap text-sm text-muted-foreground"
        >
          {reviewText}
        </pre>
      ) : null}
    </section>
  );
}

function WhatChangedPanel({
  changes,
}: {
  changes: Array<{ change_kind: string; obligation_key: string; note: string | null }>;
}) {
  const notes = changes.filter((c) => isHumanPackNote(c.note));
  return (
    <section data-testid="what-changed" className="space-y-3">
      <h2 className="text-[22px] font-semibold leading-tight text-foreground">
        {whatChangedTitle(PACK_VERSION)}
      </h2>
      <ul className="space-y-2">
        {notes.map((c) => (
          <li key={`${c.change_kind}:${c.obligation_key}`} className="text-sm text-muted-foreground">
            {c.note!.trim()}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdminHomeDashboardInner({ welcomeFlag = false }: { welcomeFlag?: boolean }) {
  const data = useAdminHomeData();
  const { org, orgId, orgName, orgLoading, now, firstName, dateLine } = data;
  const [tab, setTab] = useState<HomeTab>("this-week");

  const canManage = org
    ? isAdminLevelRole(org.role) || org.role === "manager" || org.role === "program_manager"
    : false;

  const listChanged = useServerFn(listPackWhatChanged);
  const changedQ = useQuery({
    enabled: !!orgId && canManage,
    queryKey: ["pack-what-changed", orgId],
    queryFn: () => listChanged({ data: { organizationId: orgId! } }),
    staleTime: 60_000,
  });

  const changedPayload = changedQ.data as
    | { changes?: Array<{ change_kind: string; obligation_key: string; note: string | null }>; appliedPackVersion?: string | null; result?: { changes?: Array<{ change_kind: string; obligation_key: string; note: string | null }>; appliedPackVersion?: string | null } }
    | undefined;
  const changed = changedPayload?.changes ? changedPayload : changedPayload?.result;
  const changes = changed?.changes ?? [];
  const applied = changed?.appliedPackVersion ?? null;
  const showWhatChanged = showWhatChangedTab(changes, applied, PACK_VERSION);

  if (!orgId && !orgLoading) return null;

  const tabs: Array<{ id: HomeTab; label: string; hidden?: boolean }> = [
    { id: "this-week", label: "This week" },
    { id: "review-day", label: "Review day" },
    { id: "what-changed", label: "What changed", hidden: !showWhatChanged },
  ];
  const activeTab: HomeTab = tab === "what-changed" && !showWhatChanged ? "this-week" : tab;

  return (
    <section data-testid="admin-home-dashboard" className="relative isolate min-h-full">
      <div data-testid="home-column" className="home-column relative z-10 space-y-6">
        <Suspense fallback={null}>
          <AdminHomeWelcome welcomeFlag={welcomeFlag} />
        </Suspense>
        {orgId ? <NectarOnboardingPanel welcomeFlag={welcomeFlag} /> : null}
        <div>
          <div className="text-lg font-semibold text-foreground">
            Good {greetingWord(now)}, {firstName}. Here's what needs your attention.
          </div>
          <div className="text-sm text-muted-foreground">
            {org ? `${orgName} · ${dateLine}` : dateLine}
          </div>
        </div>

        <nav data-testid="home-tabs" className="home-tabs" aria-label="Home">
          {tabs
            .filter((t) => !t.hidden)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                className={cn(
                  "home-tab",
                  activeTab === t.id ? "text-foreground" : "text-muted-foreground",
                )}
                aria-selected={activeTab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </nav>

        {activeTab === "this-week" ? <ThisWeekPlanCards /> : null}
        {activeTab === "review-day" && orgId ? <ReviewDayPanel orgId={orgId} /> : null}
        {activeTab === "what-changed" && showWhatChanged ? <WhatChangedPanel changes={changes} /> : null}
      </div>
    </section>
  );
}

export function AdminHomeDashboard({ welcomeFlag = false }: { welcomeFlag?: boolean }) {
  return (
    <Suspense
      fallback={
        <section data-testid="admin-home-dashboard" className="relative isolate min-h-full">
          <div data-testid="home-column" className="home-column relative z-10 space-y-4">
            <div>
              <div className="text-lg font-semibold text-foreground">Good day</div>
              <div className="text-sm text-muted-foreground">Loading workspace…</div>
            </div>
            <Skeleton className="h-[220px] rounded-xl" />
          </div>
        </section>
      }
    >
      <AdminHomeDashboardInner welcomeFlag={welcomeFlag} />
    </Suspense>
  );
}
