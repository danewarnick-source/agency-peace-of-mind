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
import { generateMyReview, listPackWhatChanged } from "@/lib/obligations/review-pack.functions";
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
  const mut = useMutation({
    mutationFn: () => generate({ data: { organizationId: orgId } }),
  });

  return (
    <section data-testid="review-day" className="space-y-4">
      <h2 className="text-[22px] font-semibold leading-tight" style={{ color: PI_THEME.cream }}>
        Review day
      </h2>
      <p className="text-sm" style={{ color: PI_THEME.c50 }}>
        Draft a DSPD review from this week. A human must attest. Nothing publishes itself.
      </p>
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
      {mut.data?.text ? (
        <pre
          data-testid="review-pack-text"
          className="whitespace-pre-wrap text-sm"
          style={{ color: PI_THEME.c70 }}
        >
          {mut.data.text}
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
  return (
    <section data-testid="what-changed" className="space-y-3">
      <h2 className="text-[22px] font-semibold leading-tight" style={{ color: PI_THEME.cream }}>
        What changed
      </h2>
      <ul className="space-y-2">
        {changes.map((c) => (
          <li key={`${c.change_kind}:${c.obligation_key}`} className="text-sm" style={{ color: PI_THEME.c70 }}>
            {c.change_kind}: {c.obligation_key}
            {c.note ? ` — ${c.note}` : ""}
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

  const changes = changedQ.data?.changes ?? [];
  const applied = changedQ.data?.appliedPackVersion ?? null;
  const showWhatChanged = changes.length > 0 && applied !== PACK_VERSION;

  if (!orgId && !orgLoading) return null;

  const tabs: Array<{ id: HomeTab; label: string; hidden?: boolean }> = [
    { id: "this-week", label: "This week" },
    { id: "review-day", label: "Review day" },
    { id: "what-changed", label: "What changed", hidden: !showWhatChanged },
  ];

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
                aria-selected={tab === t.id}
                style={{ color: tab === t.id ? PI_THEME.cream : PI_THEME.c50 }}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
        </nav>

        {tab === "this-week" ? <ThisWeekPlanCards /> : null}
        {tab === "review-day" && orgId ? <ReviewDayPanel orgId={orgId} /> : null}
        {tab === "what-changed" && showWhatChanged ? <WhatChangedPanel changes={changes} /> : null}
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
