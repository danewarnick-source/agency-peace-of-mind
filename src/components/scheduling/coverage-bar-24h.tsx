import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { classesForCode } from "@/lib/scheduling/code-colors";
import { coverageCountMinutes, requiredMinutes, uncoveredBands } from "@/lib/scheduling/coverage-count";

export interface CoverageShift {
  id: string;
  starts_at: string;
  ends_at: string;
  staff_id: string | null;
  service_code?: string | null;
  job_code?: string | null;
  /** 1:1 segments (set) subtract their staff from home coverage. */
  parent_shift_id?: string | null;
}

export interface CoverageRequirement {
  start_time: string; // "HH:MM"
  end_time: string;
  required_staff_count: number;
}

interface Props {
  day: Date;
  shifts: CoverageShift[];
  requirements?: CoverageRequirement[];
  /**
   * Per-minute required-staff array (length 1440) computed from resident
   * ratios — Utah DSPD SOW §1.33. When provided, the effective requirement
   * is element-wise max(computed, manual). The manual `requirements` only
   * RAISE the bar; they never override the ratio-derived baseline.
   */
  computedRequiredMinutes?: number[];
  /** Extra line appended to the bar tooltip (e.g. the 2:1 rights-mod warning). */
  tooltipNote?: string;
  className?: string;
  /** Tiny variant for All-homes week cells: thin bar + one-line label. */
  micro?: boolean;
}

/**
 * 24-hour coverage bar (00:00 → 24:00) for a single day at a single location.
 * Renders each shift as a colored band by service-code family, overlays
 * red-striped gaps where staffing falls below the requirement and
 * green-striped bands where it exceeds it (over-coverage).
 */
export function CoverageBar24h({ day, shifts, requirements = [], computedRequiredMinutes, tooltipNote, className, micro }: Props) {
  const dayStart = useMemo(() => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [day]);
  const dayEnd = dayStart + 24 * 3600 * 1000;

  const bands = useMemo(() => {
    return shifts
      .filter((s) => !s.parent_shift_id) // segments don't add home coverage
      .map((s) => {
        const s0 = Math.max(new Date(s.starts_at).getTime(), dayStart);
        const s1 = Math.min(new Date(s.ends_at).getTime(), dayEnd);
        if (s1 <= s0) return null;
        const left = ((s0 - dayStart) / (24 * 3600 * 1000)) * 100;
        const width = ((s1 - s0) / (24 * 3600 * 1000)) * 100;
        const cls = classesForCode(s.service_code ?? s.job_code);
        const open = !s.staff_id;
        return { id: s.id, left, width, cls, open };
      })
      .filter(Boolean) as Array<{ id: string; left: number; width: number; cls: ReturnType<typeof classesForCode>; open: boolean }>;
  }, [shifts, dayStart, dayEnd]);

  // Minute-by-minute coverage vs requirement (segments subtract their staff).
  const { gaps, overs, hasRequirement } = useMemo(() => {
    const hasComputed = !!computedRequiredMinutes && computedRequiredMinutes.length > 0;
    if (requirements.length === 0 && !hasComputed) {
      return { gaps: [], overs: [], hasRequirement: false } as {
        gaps: Array<{ left: number; width: number }>;
        overs: Array<{ left: number; width: number }>;
        hasRequirement: boolean;
      };
    }
    const minutes = coverageCountMinutes(dayStart, shifts);
    const manual = requirements.length ? requiredMinutes(requirements) : new Array(1440).fill(0);
    const computed = hasComputed ? computedRequiredMinutes! : new Array(1440).fill(0);
    const required = new Array<number>(1440);
    for (let i = 0; i < 1440; i++) required[i] = Math.max(manual[i] ?? 0, computed[i] ?? 0);
    const gaps = uncoveredBands(minutes, required);
    const overs: Array<{ left: number; width: number }> = [];
    let i = 0;
    const n = 24 * 60;
    while (i < n) {
      if (required[i] > 0 && minutes[i] > required[i]) {
        const start = i;
        while (i < n && required[i] > 0 && minutes[i] > required[i]) i++;
        overs.push({ left: (start / n) * 100, width: ((i - start) / n) * 100 });
      } else i++;
    }
    return { gaps, overs, hasRequirement: true };
  }, [shifts, requirements, computedRequiredMinutes, dayStart]);


  const hasGap = gaps.length > 0;
  const hasOver = overs.length > 0;
  const staffedCount = useMemo(
    () => new Set(shifts.filter((s) => s.staff_id && !s.parent_shift_id).map((s) => s.staff_id)).size,
    [shifts],
  );

  const baseTip = hasGap ? "Coverage gap vs required staffing" : hasRequirement ? "Meets ratio-computed requirement" : "";
  const titleAttr = [baseTip, tooltipNote].filter(Boolean).join(" — ") || undefined;

  return (
    <div className={cn("w-full", className)} title={titleAttr}>
      <div className={cn("relative w-full rounded-md bg-muted/50 overflow-hidden", micro ? "h-2" : "h-3")}>

        {bands.map((b) => (
          <div
            key={b.id}
            className={cn(
              "absolute top-0 h-full",
              b.open ? "bg-destructive/30 border border-destructive/60" : b.cls.bg,
            )}
            style={{ left: `${b.left}%`, width: `${b.width}%` }}
            title={b.open ? "Open / unassigned" : undefined}
          />
        ))}
        {overs.map((o, i) => (
          <div
            key={`over-${i}`}
            className="absolute top-0 h-full"
            style={{
              left: `${o.left}%`,
              width: `${o.width}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(16,185,129,0.55) 0 3px, transparent 3px 6px)",
            }}
            title="Over-coverage (staffing above requirement)"
          />
        ))}
        {gaps.map((g, i) => (
          <div
            key={`gap-${i}`}
            className="absolute top-0 h-full bg-destructive/50"
            style={{
              left: `${g.left}%`,
              width: `${g.width}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 3px, transparent 3px 6px)",
            }}
            title="Uncovered"
          />
        ))}
      </div>
      {micro ? (
        <div
          className={cn(
            "mt-0.5 text-[9px] font-semibold leading-none tabular-nums",
            hasGap ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hasGap ? "gap" : hasOver ? "over" : staffedCount > 0 ? `${staffedCount} staff` : "—"}
        </div>
      ) : (
        <>
          <div className="mt-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
          {requirements.length > 0 && (
            <div className={cn("mt-1 text-[11px] font-semibold", hasGap ? "text-destructive" : "text-emerald-600")}>
              {hasGap ? "⚠ Coverage gap" : hasOver ? "✓ Met (over-staffed in places)" : "✓ Requirement met"}
            </div>
          )}
        </>
      )}
    </div>
  );
}
