import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { classesForCode } from "@/lib/scheduling/code-colors";

export interface CoverageShift {
  id: string;
  starts_at: string;
  ends_at: string;
  staff_id: string | null;
  service_code?: string | null;
  job_code?: string | null;
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
  className?: string;
}

/**
 * 24-hour coverage bar (00:00 → 24:00) for a single day at a single location.
 * Renders each shift as a colored band by service-code family, and overlays
 * gaps where staffing count falls below the requirement for that window.
 */
export function CoverageBar24h({ day, shifts, requirements = [], className }: Props) {
  const dayStart = useMemo(() => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [day]);
  const dayEnd = dayStart + 24 * 3600 * 1000;

  const bands = useMemo(() => {
    return shifts
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

  // Gap segments: minute-by-minute coverage vs requirement.
  const gaps = useMemo(() => {
    if (requirements.length === 0) return [] as Array<{ left: number; width: number }>;
    const minutes = new Array(24 * 60).fill(0);
    for (const s of shifts) {
      if (!s.staff_id) continue;
      const s0 = Math.max(new Date(s.starts_at).getTime(), dayStart);
      const s1 = Math.min(new Date(s.ends_at).getTime(), dayEnd);
      if (s1 <= s0) continue;
      const m0 = Math.floor((s0 - dayStart) / 60000);
      const m1 = Math.ceil((s1 - dayStart) / 60000);
      for (let i = m0; i < m1; i++) minutes[i] += 1;
    }
    const required = new Array(24 * 60).fill(0);
    for (const r of requirements) {
      const [sh, sm] = r.start_time.split(":").map(Number);
      const [eh, em] = r.end_time.split(":").map(Number);
      const a = sh * 60 + sm;
      const b = (eh === 0 && em === 0 ? 24 * 60 : eh * 60 + em);
      for (let i = a; i < b; i++) required[i] = Math.max(required[i], r.required_staff_count);
    }
    const out: Array<{ left: number; width: number }> = [];
    let i = 0;
    while (i < 24 * 60) {
      if (required[i] > minutes[i]) {
        const start = i;
        while (i < 24 * 60 && required[i] > minutes[i]) i++;
        out.push({ left: (start / (24 * 60)) * 100, width: ((i - start) / (24 * 60)) * 100 });
      } else i++;
    }
    return out;
  }, [shifts, requirements, dayStart, dayEnd]);

  const hasGap = gaps.length > 0;

  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-3 w-full rounded-md bg-muted/50 overflow-hidden">
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
      <div className="mt-1 flex items-center justify-between text-[10px] font-medium text-muted-foreground tabular-nums">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
      {requirements.length > 0 && (
        <div className={cn("mt-1 text-[11px] font-semibold", hasGap ? "text-destructive" : "text-emerald-600")}>
          {hasGap ? "⚠ Coverage gap" : "✓ Requirement met"}
        </div>
      )}
    </div>
  );
}
