/**
 * Admin Home — data-driven (0a8f11df derivation) painted with PI tokens.
 * Feeling-hero JSX lives unused in admin-home-welcome.tsx for Step 3.
 */
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlarmClock, BarChart3, CircleUser, Lightbulb, Users } from "lucide-react";
import { PI_GRAIN_SVG, PI_THEME } from "@/lib/pi-theme";
import { cn } from "@/lib/utils";
import {
  formatDueDate,
  greetingWord,
  initials,
  nextBillingWindowLabel,
  useAdminHomeData,
} from "@/components/admin-home/use-admin-home-data";

const SERIF = { fontFamily: PI_THEME.serif } as const;
const SANS = { fontFamily: PI_THEME.sans } as const;

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

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-md", className)}
      style={{ background: PI_THEME.c08 }}
    />
  );
}

function TileSkeleton() {
  return <Skeleton className="h-[130px] rounded-xl" />;
}

function CardBodySkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function LoadError({ children }: { children: ReactNode }) {
  return (
    <p className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
      {children}
    </p>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "red" | "amber" | "green";
  children: ReactNode;
}) {
  const palette =
    tone === "red"
      ? { bg: "rgba(224, 138, 128, 0.16)", fg: PI_THEME.red }
      : tone === "amber"
        ? { bg: PI_THEME.goldSoft, fg: PI_THEME.amber }
        : { bg: "rgba(95, 174, 127, 0.16)", fg: PI_THEME.ok };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {tone === "green" ? <CheckMark /> : null}
      {children}
    </span>
  );
}

function ProgressBar({ ratio, color }: { ratio: number; color: string }) {
  const width = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: PI_THEME.c08 }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

function barColor(completed: number, total: number): string {
  if (total <= 0) return PI_THEME.ok;
  const ratio = completed / total;
  if (ratio < 0.6) return PI_THEME.red;
  if (ratio < 0.9) return PI_THEME.amber;
  return PI_THEME.ok;
}

const liftCard: CSSProperties = {
  background: PI_THEME.cardBg,
  border: `1px solid ${PI_THEME.hairlines.faint}`,
  boxShadow: PI_THEME.shadow1,
};

function Lift({
  className,
  children,
  style,
}: {
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5",
        className,
      )}
      style={{ ...liftCard, ...style }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = PI_THEME.shadow2;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = style?.boxShadow ?? PI_THEME.shadow1;
      }}
    >
      {children}
    </div>
  );
}

function AdminHomeDashboardInner() {
  const data = useAdminHomeData();
  const {
    org,
    orgId,
    orgName,
    orgLoading,
    now,
    derived,
    clients,
    firstName,
    dateLine,
    plus14Ymd,
    todayYmd,
    topOverdue,
    dueSoon,
    instancesFailed,
    instancesLoading,
    clientsFailed,
    clientsLoading,
  } = data;

  if (!orgId && !orgLoading) return null;

  return (
    <section
      data-testid="admin-home-dashboard"
      className="relative isolate min-h-full"
      style={{ background: PI_THEME.navy, color: PI_THEME.cream, ...SANS }}
    >
      <PageGlow />
      <Grain />
      <div className="relative z-10 space-y-4 px-5 py-6 sm:px-8 lg:px-10">
        <div>
          <div className="text-lg font-semibold" style={{ ...SERIF, color: PI_THEME.cream }}>
            Good {greetingWord(now)}, {firstName}. Here's what needs your attention.
          </div>
          <div className="text-sm" style={{ color: PI_THEME.c50 }}>
            {org ? `${orgName} · ${dateLine}` : dateLine}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {instancesLoading ? (
            <Skeleton className="h-[280px] rounded-2xl" />
          ) : instancesFailed ? (
            <Lift className="p-5">
              <LoadError>Could not load overdue items.</LoadError>
            </Lift>
          ) : derived.overdue.length === 0 ? (
            <Lift
              className="p-5"
              style={{
                background: PI_THEME.heroTileBg,
                border: `1px solid rgba(95, 174, 127, 0.35)`,
              }}
            >
              <div
                className="text-4xl font-extrabold tabular-nums"
                style={{ ...SERIF, color: PI_THEME.ok }}
              >
                0
              </div>
              <div className="mt-2 text-sm font-semibold" style={{ color: PI_THEME.ok }}>
                All current
              </div>
              <p className="mt-1 text-sm" style={{ color: PI_THEME.c50 }}>
                No overdue obligation instances.
              </p>
            </Lift>
          ) : (
            <Lift className="p-5" style={{ background: PI_THEME.heroTileBg }}>
              <div
                className="text-4xl font-extrabold tabular-nums leading-none"
                style={{ ...SERIF, color: PI_THEME.red }}
              >
                {derived.overdue.length}
              </div>
              <div className="mt-2 text-sm font-medium" style={{ color: PI_THEME.c70 }}>
                Overdue obligation instance{derived.overdue.length === 1 ? "" : "s"}
              </div>
              <ul className="mt-4 space-y-2.5">
                {topOverdue.map((item) => (
                  <li
                    key={item.id}
                    className="pb-2.5 last:pb-0"
                    style={{ borderBottom: `1px solid ${PI_THEME.hairlines.faint}` }}
                  >
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    <div
                      className="mt-0.5 flex items-center justify-between gap-3 text-xs"
                      style={{ color: PI_THEME.c50 }}
                    >
                      <span className="truncate">{item.assignee}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: PI_THEME.red }}>
                        {item.days} day{item.days === 1 ? "" : "s"} overdue
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/dashboard/company-obligations"
                className="mt-4 inline-flex cursor-pointer text-sm font-medium hover:underline"
                style={{ color: PI_THEME.gold }}
              >
                View all →
              </Link>
            </Lift>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {instancesLoading ? (
              <TileSkeleton />
            ) : (
              <Lift className="p-4">
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{
                    color:
                      !instancesFailed && derived.staffWithOverdue > 0
                        ? PI_THEME.red
                        : PI_THEME.cream,
                  }}
                >
                  {instancesFailed ? "—" : derived.staffWithOverdue}
                </div>
                <div className="mt-1 text-sm font-medium">Staff with overdue</div>
                <div className="mt-0.5 text-xs" style={{ color: PI_THEME.c50 }}>
                  {instancesFailed ? "Could not load" : "People with at least one overdue item"}
                </div>
              </Lift>
            )}

            {instancesLoading ? (
              <TileSkeleton />
            ) : (
              <Lift className="p-4">
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{ color: instancesFailed ? PI_THEME.cream : PI_THEME.amber }}
                >
                  {instancesFailed ? "—" : derived.pendingWithin30}
                </div>
                <div className="mt-1 text-sm font-medium">Due within 30 days</div>
                <div className="mt-0.5 text-xs" style={{ color: PI_THEME.c50 }}>
                  {instancesFailed ? "Could not load" : "Pending instances"}
                </div>
              </Lift>
            )}

            {instancesLoading ? (
              <TileSkeleton />
            ) : (
              <Lift className="p-4">
                <div
                  className="text-2xl font-bold tabular-nums"
                  style={{
                    color:
                      !instancesFailed && derived.recommendations.length > 0
                        ? PI_THEME.amber
                        : PI_THEME.cream,
                  }}
                >
                  {instancesFailed ? "—" : derived.recommendations.length}
                </div>
                <div className="mt-1 text-sm font-medium">Recommendations</div>
                <div className="mt-0.5 text-xs" style={{ color: PI_THEME.c50 }}>
                  {instancesFailed ? "Could not load" : "From obligation data"}
                </div>
              </Lift>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Lift className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" style={{ color: PI_THEME.gold }} />
              Staff status
            </h2>
            {instancesLoading ? (
              <CardBodySkeleton />
            ) : instancesFailed ? (
              <LoadError>Could not load staff status.</LoadError>
            ) : (
              <ul>
                {derived.staff.map((m, idx) => {
                  const avatarBg = PI_THEME.avatarBg[idx % PI_THEME.avatarBg.length];
                  return (
                    <li
                      key={m.id}
                      style={{ borderBottom: `1px solid ${PI_THEME.hairlines.faint}` }}
                      className="last:border-0"
                    >
                      <Link
                        to="/dashboard/employees/$staffId"
                        params={{ staffId: m.id }}
                        className="flex cursor-pointer items-center gap-2.5 py-2.5 transition"
                        style={{ color: PI_THEME.cream }}
                      >
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                          style={{ background: avatarBg, color: PI_THEME.cream }}
                        >
                          {initials(m.name)}
                        </span>
                        <div className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</div>
                        {m.overdue > 0 ? (
                          <StatusBadge tone="red">{m.overdue} overdue</StatusBadge>
                        ) : m.pending > 0 ? (
                          <StatusBadge tone="amber">{m.pending} pending</StatusBadge>
                        ) : (
                          <StatusBadge tone="green">Current</StatusBadge>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {derived.staff.length === 0 && (
                  <li className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
                    No assigned staff yet.
                  </li>
                )}
              </ul>
            )}
          </Lift>

          <Lift className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <AlarmClock className="h-4 w-4" style={{ color: PI_THEME.gold }} />
              Due soon
            </h2>
            {instancesLoading ? (
              <CardBodySkeleton />
            ) : instancesFailed ? (
              <LoadError>Could not load upcoming due dates.</LoadError>
            ) : (
              <ul>
                {dueSoon.map((item) => {
                  const color =
                    item.dueYmd < todayYmd
                      ? PI_THEME.red
                      : item.dueYmd <= plus14Ymd
                        ? PI_THEME.amber
                        : PI_THEME.c70;
                  return (
                    <li
                      key={item.id}
                      style={{ borderBottom: `1px solid ${PI_THEME.hairlines.faint}` }}
                    >
                      <Link
                        to="/dashboard/company-obligations"
                        className="flex cursor-pointer items-start justify-between gap-3 py-2.5 transition"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{item.title}</div>
                          {item.sow ? (
                            <div className="truncate text-xs" style={{ color: PI_THEME.c50 }}>
                              {item.sow}
                            </div>
                          ) : null}
                        </div>
                        <div
                          className="shrink-0 text-xs font-semibold tabular-nums"
                          style={{ color }}
                        >
                          {formatDueDate(item.dueAt)}
                        </div>
                      </Link>
                    </li>
                  );
                })}
                {dueSoon.length === 0 && (
                  <li className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
                    Nothing due soon.
                  </li>
                )}
              </ul>
            )}
          </Lift>

          <Lift className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="h-4 w-4" style={{ color: PI_THEME.gold }} />
              Recommendations
            </h2>
            {instancesLoading ? (
              <CardBodySkeleton />
            ) : instancesFailed ? (
              <LoadError>Could not load recommendations.</LoadError>
            ) : derived.recommendations.length > 0 ? (
              <ul className="space-y-3">
                {derived.recommendations.map((rec) => (
                  <li key={rec.key} className="text-sm" style={{ color: PI_THEME.c70 }}>
                    {rec.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
                No recommendations right now.
              </p>
            )}
          </Lift>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
          <Lift className="p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <BarChart3 className="h-4 w-4" style={{ color: PI_THEME.gold }} />
              Compliance by area
            </h2>
            {instancesLoading ? (
              <CardBodySkeleton rows={5} />
            ) : instancesFailed ? (
              <LoadError>Could not load compliance by area.</LoadError>
            ) : (
              <div className="space-y-4">
                {derived.areas.map((area) => {
                  const color = barColor(area.completed, area.total);
                  const ratio = area.total > 0 ? area.completed / area.total : 0;
                  return (
                    <div key={area.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-sm">{area.label}</span>
                        <span className="text-sm font-semibold tabular-nums" style={{ color }}>
                          {area.completed} of {area.total}
                        </span>
                      </div>
                      <ProgressBar ratio={ratio} color={color} />
                    </div>
                  );
                })}
                {derived.areas.length === 0 && (
                  <p className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
                    No obligation instances yet.
                  </p>
                )}
              </div>
            )}
          </Lift>

          <Lift className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <CircleUser className="h-4 w-4" style={{ color: PI_THEME.gold }} />
              Active clients
            </h2>
            {clientsLoading ? (
              <CardBodySkeleton />
            ) : clientsFailed ? (
              <LoadError>Could not load clients.</LoadError>
            ) : (
              <ul>
                {clients.map((c, idx) => {
                  const name = `${c.first_name} ${c.last_name}`.trim();
                  const codes = (c.authorized_dspd_codes ?? []).filter(Boolean);
                  const avatarBg = PI_THEME.avatarBg[idx % PI_THEME.avatarBg.length];
                  return (
                    <li
                      key={c.id}
                      style={{ borderBottom: `1px solid ${PI_THEME.hairlines.faint}` }}
                    >
                      <div className="flex items-center gap-2.5 py-2.5">
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                          style={{ background: avatarBg, color: PI_THEME.cream }}
                        >
                          {initials(name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{name}</div>
                          <div className="truncate text-xs" style={{ color: PI_THEME.c50 }}>
                            {codes.length ? codes.join(" · ") : "No authorized codes"}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {clients.length === 0 && (
                  <li className="py-6 text-sm" style={{ color: PI_THEME.c50 }}>
                    No active clients.
                  </li>
                )}
              </ul>
            )}
            <div
              className="mt-3 pt-3"
              style={{ borderTop: `1px solid ${PI_THEME.hairlines.faint}` }}
            >
              <div className="text-xs font-medium" style={{ color: PI_THEME.c50 }}>
                Next billing window
              </div>
              <div className="mt-0.5 text-sm font-semibold">{nextBillingWindowLabel(now)}</div>
            </div>
          </Lift>
        </div>
      </div>
    </section>
  );
}

export function AdminHomeDashboard() {
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
          <div className="relative z-10 space-y-4 px-5 py-6 sm:px-8">
            <div>
              <div className="text-lg font-semibold">Good day</div>
              <div className="text-sm" style={{ color: PI_THEME.c50 }}>
                Loading workspace…
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-[280px] rounded-2xl" />
              <div className="grid grid-cols-3 gap-3">
                <TileSkeleton />
                <TileSkeleton />
                <TileSkeleton />
              </div>
            </div>
          </div>
        </section>
      }
    >
      <AdminHomeDashboardInner />
    </Suspense>
  );
}
