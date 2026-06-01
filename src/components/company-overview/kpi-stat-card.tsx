import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import type { ComponentType } from "react";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  hint,
  to,
}: {
  icon: IconType;
  label: string;
  value: string | number;
  delta?: string;
  hint?: string;
  to?: string;
}) {
  const inner = (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-card backdrop-blur transition hover:border-[#f4a93a]/50">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        {to && <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold tabular-nums text-[#0d112b]">{value}</span>
        {delta && (
          <span className="rounded-full border border-[#f4a93a]/40 bg-[#f4a93a]/10 px-2 py-0.5 text-[10px] font-semibold text-[#7a4a0a]">
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  if (!to) return inner;
  return <Link to={to}>{inner}</Link>;
}

/**
 * Progress-ring stat — used for Training Completion / Compliance Status.
 * Ring turns amber when below `target`.
 */
export function ProgressRingCard({
  icon: Icon,
  label,
  pct,
  target = 80,
  hint,
  to,
}: {
  icon: IconType;
  label: string;
  pct: number;
  target?: number;
  hint?: string;
  to?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = 28;
  const c = 2 * Math.PI * radius;
  const dash = (clamped / 100) * c;
  const ringColor = clamped >= target ? "#1f7a4d" : "#f4a93a";

  const inner = (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/80 p-4 shadow-card backdrop-blur transition hover:border-[#f4a93a]/50">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        {to && <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
          <circle cx="36" cy="36" r={radius} stroke="#e4e7ef" strokeWidth="6" fill="none" />
          <circle
            cx="36" cy="36" r={radius}
            stroke={ringColor}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${dash} ${c - dash}`}
            transform="rotate(-90 36 36)"
            style={{ transition: "stroke-dasharray .6s ease, stroke .3s" }}
          />
          <text x="36" y="40" textAnchor="middle" className="fill-[#0d112b]"
            style={{ font: "700 14px var(--font-display)" }}>
            {clamped}%
          </text>
        </svg>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </div>
  );
  if (!to) return inner;
  return <Link to={to}>{inner}</Link>;
}
