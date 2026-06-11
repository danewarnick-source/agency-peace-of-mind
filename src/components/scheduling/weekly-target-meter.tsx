import { cn } from "@/lib/utils";
import { classesForCode } from "@/lib/scheduling/code-colors";

interface Props {
  serviceCode: string;
  scheduledHours: number;
  targetHours: number;
  className?: string;
  compact?: boolean;
}

/**
 * Horizontal meter showing scheduled-vs-target weekly hours for a
 * (client, service code) pair. Used in the host-home strip and the worksheet.
 */
export function WeeklyTargetMeter({ serviceCode, scheduledHours, targetHours, className, compact }: Props) {
  const fc = classesForCode(serviceCode);
  const pct = targetHours > 0 ? Math.min(100, (scheduledHours / targetHours) * 100) : 0;
  const over = targetHours > 0 && scheduledHours > targetHours;
  const under = targetHours > 0 && scheduledHours < targetHours;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between text-[11px] font-semibold mb-0.5">
        <span className={cn(fc.text)}>{serviceCode}</span>
        <span className={cn("tabular-nums", over ? "text-amber-600" : under ? "text-muted-foreground" : "text-emerald-600")}>
          {scheduledHours.toFixed(1)} / {targetHours.toFixed(1)}h
        </span>
      </div>
      <div className={cn("relative w-full rounded-full bg-muted overflow-hidden", compact ? "h-1.5" : "h-2")}>
        <div
          className={cn("absolute inset-y-0 left-0 transition-all", over ? "bg-amber-500" : fc.bg)}
          style={{ width: `${pct}%` }}
        />
        {over && (
          <div
            className="absolute inset-y-0 bg-amber-500/40"
            style={{ left: "100%", width: `${Math.min(40, ((scheduledHours - targetHours) / targetHours) * 100)}%` }}
          />
        )}
      </div>
    </div>
  );
}
