/**
 * Admin Home welcome banner — mountain backdrop, setup chips, destination pills.
 * Max ~280px on desktop. Sits above the Home greeting, not its own page.
 */
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentOrg } from "@/hooks/use-org";
import { PI_THEME } from "@/lib/pi-theme";
import {
  ADMIN_HOME_CARDS,
  ADMIN_HOME_EYEBROW,
  ADMIN_HOME_HEADLINE,
  ADMIN_HOME_SUBHEAD,
} from "@/lib/admin-home-feeling";
import { dismissAdminWelcome } from "@/lib/admin-home-welcome.functions";
import { shouldShowWelcome, welcomeSetupProgress } from "@/lib/admin-home-welcome-rule";
import {
  adminHomeWelcomeQueryKey,
  useAdminHomeWelcomeCounts,
} from "@/components/admin-home/use-admin-home-welcome";

const SERIF = { fontFamily: PI_THEME.serif } as const;
const SANS = { fontFamily: PI_THEME.sans } as const;

function MountainBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg, ${PI_THEME.n3} 0%, ${PI_THEME.n2} 38%, ${PI_THEME.navy} 72%, ${PI_THEME.navy} 100%)`,
        }}
      />
      <svg
        className="absolute inset-x-0 bottom-0 h-[78%] w-full"
        viewBox="0 0 1440 640"
        preserveAspectRatio="xMidYMax slice"
        fill="none"
      >
        <path
          fill={PI_THEME.n2}
          d="M0 392C168 318 318 354 478 286C638 218 786 304 954 248C1122 192 1272 258 1440 228V640H0V392Z"
        />
        <path
          fill={PI_THEME.n1}
          d="M0 448C196 372 352 424 520 368C700 304 868 412 1054 356C1220 310 1328 396 1440 368V640H0V448Z"
        />
        <path
          fill={PI_THEME.navy}
          d="M0 528C214 470 392 554 620 500C848 446 1096 560 1440 486V640H0V528Z"
        />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${PI_THEME.navy}, transparent 55%, ${PI_THEME.navy}66)`,
        }}
      />
    </div>
  );
}

function CheckMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      className={className}
      aria-hidden
      fill="none"
    >
      <path
        d="M3.2 8.3 6.1 11.2 12.8 4.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ProgressChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span
      data-testid={`welcome-chip-${label}`}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        background: done ? "rgba(95, 174, 127, 0.16)" : PI_THEME.c08,
        color: done ? PI_THEME.ok : PI_THEME.c50,
        border: `1px solid ${done ? "rgba(95, 174, 127, 0.35)" : PI_THEME.hairlines.faint}`,
      }}
    >
      {done ? <CheckMark /> : (
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: PI_THEME.c30 }}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}

export function AdminHomeWelcome({ welcomeFlag = false }: { welcomeFlag?: boolean }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const countsQ = useAdminHomeWelcomeCounts(orgId);
  const dismissFn = useServerFn(dismissAdminWelcome);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [hiddenNow, setHiddenNow] = useState(false);

  if (!orgId) return null;
  if (hiddenNow) return null;
  if (!countsQ.data) return null;

  const counts = countsQ.data;
  const show = shouldShowWelcome({
    orgCreatedAt: counts.orgCreatedAt,
    now: new Date(),
    welcomeDismissedAt: counts.welcomeDismissedAt,
    memberCount: counts.memberCount,
    clientCount: counts.clientCount,
    documentedShiftCount: counts.documentedShiftCount,
    welcomeFlag,
  });
  if (!show) return null;

  const progress = welcomeSetupProgress(counts);

  const hideBanner = async () => {
    setHiddenNow(true);
    try {
      await dismissFn({ data: { organizationId: orgId } });
      await queryClient.invalidateQueries({ queryKey: adminHomeWelcomeQueryKey(orgId) });
    } catch {
      /* banner already hidden; persist can retry on next visit */
    }
    void navigate({ to: "/dashboard", search: {} });
  };

  return (
    <section
      data-testid="admin-home-welcome"
      aria-label="Welcome"
      className="relative isolate overflow-hidden rounded-2xl lg:max-h-[280px]"
      style={{ ...SANS, color: PI_THEME.cream, boxShadow: PI_THEME.shadow1 }}
    >
      <MountainBackdrop />
      <div className="relative z-10 flex h-full flex-col justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-[10px] font-medium uppercase tracking-[0.22em]"
              style={{ color: PI_THEME.cream }}
            >
              {ADMIN_HOME_EYEBROW}
            </p>
            <h2
              className="mt-1 text-[1.65rem] leading-[1.12] tracking-tight sm:text-[1.85rem]"
              style={{ ...SERIF, color: PI_THEME.cream }}
            >
              {ADMIN_HOME_HEADLINE}
            </h2>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed" style={{ color: PI_THEME.c70 }}>
              {ADMIN_HOME_SUBHEAD}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void hideBanner()}
            className="shrink-0 text-right text-[12px] underline-offset-2 hover:underline"
            style={{ color: PI_THEME.c70 }}
          >
            Skip — take me to my dashboard
          </button>
        </div>

        {progress.allDone ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px]" style={{ color: PI_THEME.cream }}>
              You&apos;re set up. This banner will close itself.
            </p>
            <button
              type="button"
              onClick={() => void hideBanner()}
              className="inline-flex items-center rounded-xl px-5 py-2 text-[13px] font-medium tracking-tight"
              style={{
                background: PI_THEME.buttons.primaryBg,
                color: PI_THEME.buttons.primaryFg,
                boxShadow: PI_THEME.buttons.primaryShadow,
              }}
            >
              Go to my dashboard
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <ProgressChip done={progress.inviteStaff} label="Invite staff" />
              <ProgressChip done={progress.addClient} label="Add a client" />
              <ProgressChip done={progress.documentShift} label="Document a shift" />
            </div>
            <div className="hidden gap-2 md:grid md:grid-cols-3">
              {ADMIN_HOME_CARDS.map((card) => (
                <Link
                  key={card.key}
                  to={card.to}
                  aria-label={`${card.title} — ${card.cta}`}
                  className="rounded-xl border px-3 py-2.5 transition hover:brightness-110"
                  style={{
                    borderColor: PI_THEME.hairlines.soft,
                    background: PI_THEME.c04,
                    color: PI_THEME.cream,
                  }}
                >
                  <div className="text-[13px] font-medium" style={{ color: PI_THEME.cream }}>
                    {card.title}
                  </div>
                  <div className="mt-0.5 text-[12px]" style={{ color: PI_THEME.c70 }}>
                    {card.cta}
                  </div>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
              {ADMIN_HOME_CARDS.map((card, i) => (
                <span key={card.key} className="inline-flex items-center gap-2">
                  {i > 0 ? (
                    <span aria-hidden style={{ color: PI_THEME.c30 }}>
                      ·
                    </span>
                  ) : null}
                  <Link
                    to={card.to}
                    className="inline-flex rounded-full px-3 py-1 text-[12px] font-medium"
                    style={{
                      background: PI_THEME.c08,
                      color: PI_THEME.cream,
                      border: `1px solid ${PI_THEME.hairlines.soft}`,
                    }}
                  >
                    {card.cta}
                  </Link>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
