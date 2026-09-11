/**
 * Admin Home — decisions this week, not escalation tiles.
 * Welcome banner (AdminHomeWelcome) sits above the greeting.
 */
import { Suspense, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PI_GRAIN_SVG, PI_THEME } from "@/lib/pi-theme";
import { cn } from "@/lib/utils";
import { greetingWord, useAdminHomeData } from "@/components/admin-home/use-admin-home-data";
import { AdminHomeWelcome } from "@/components/admin-home/admin-home-welcome";
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

const SERIF = { fontFamily: PI_THEME.serif } as const;
const SANS = { fontFamily: PI_THEME.sans } as const;

type HomeTab = "this-week" | "review-day" | "what-changed";

function Grain() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity: PI_THEME.grainOpacity,
        mixBlendMode: "overlay",
        backgroundImage: `url("${PI_GRAIN_SVG}")`,
      }}
    />
  );
}

function PageGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{ background: PI_THEME.pageGlow }}
    />
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md", className)}
      style={{ background: PI_THEME.c08 }}
    />
  );
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
      <h2 className="text-[22px] font-semibold leading-tight" style={{ color: PI_THEME.cream }}>
        Review day
      </h2>
      <p className="text-sm" style={{ color: PI_THEME.c50 }}>
        Draft a DSPD review from this week. A human must attest. Nothing publishes itself.
      </p>
      {metaLine ? (
        <p data-testid="review-day-meta" className="text-sm" style={{ color: PI_THEME.c50 }}>
          {metaLine}
        </p>
      ) : null}
      <button
        type="button"
        className="act-btn"
        style={{
          background: PI_THEME.buttons.primaryBg,
          color: PI_THEME.buttons.primaryFg,
          boxShadow: PI_THEME.buttons.primaryShadow,
        }}
        onClick={() => mut.mutate()}
      >
        Generate my DSPD review
      </button>
      {mut.isPending ? (
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Generating draft.
        </p>
      ) : null}
      {mut.isError ? (
        <p className="text-sm" style={{ color: PI_THEME.c50 }}>
          Could not generate the review.
        </p>
      ) : null}
      {reviewText ? (
        <pre
          data-testid="review-pack-text"
          className="whitespace-pre-wrap text-sm"
          style={{ color: PI_THEME.c70 }}
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
      <h2 className="text-[22px] font-semibold leading-tight" style={{ color: PI_THEME.cream }}>
        {whatChangedTitle(PACK_VERSION)}
      </h2>
      <ul className="space-y-2">
        {notes.map((c) => (
          <li key={`${c.change_kind}:${c.obligation_key}`} className="text-sm" style={{ color: PI_THEME.c70 }}>
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
    <section
      data-testid="admin-home-dashboard"
      className="relative isolate min-h-full"
      style={{ background: PI_THEME.navy, color: PI_THEME.cream, ...SANS }}
    >
      <PageGlow />
      <Grain />
      <div data-testid="home-column" className="home-column relative z-10 space-y-6">
        <Suspense fallback={null}>
          <AdminHomeWelcome welcomeFlag={welcomeFlag} />
        </Suspense>
        <div>
          <div className="text-lg font-semibold" style={{ ...SERIF, color: PI_THEME.cream }}>
            Good {greetingWord(now)}, {firstName}. Here's what needs your attention.
          </div>
          <div className="text-sm" style={{ color: PI_THEME.c50 }}>
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
                className="home-tab"
                aria-selected={activeTab === t.id}
                style={{ color: activeTab === t.id ? PI_THEME.cream : PI_THEME.c50 }}
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
        <section
          data-testid="admin-home-dashboard"
          className="relative isolate min-h-full"
          style={{ background: PI_THEME.navy, color: PI_THEME.cream }}
        >
          <PageGlow />
          <Grain />
          <div data-testid="home-column" className="home-column relative z-10 space-y-4">
            <div>
              <div className="text-lg font-semibold">Good day</div>
              <div className="text-sm" style={{ color: PI_THEME.c50 }}>
                Loading workspace…
              </div>
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
