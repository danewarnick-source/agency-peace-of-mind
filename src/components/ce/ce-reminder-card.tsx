// Staff dashboard reminder card for Continuing Education.
// Shows when the staff member is in CE (Year 2+) and is behind pace or has no
// current-month module yet. Hidden otherwise so we don't nag complete staff.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyCeStatus } from "@/lib/ce.functions";
import { GraduationCap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CeReminderCard() {
  const fetchStatus = useServerFn(getMyCeStatus);
  const { data: status } = useQuery({
    queryKey: ["ce-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });

  if (!status || !status.ceApplies) return null;
  const remaining = Math.max(0, status.goalHours - status.hoursThisYear);
  if (remaining <= 0) return null;

  // Pace check: expected hours by now ≈ goal * months_in / 12.
  const monthsIn = status.ceYearStart
    ? Math.min(12, Math.max(0, Math.round((Date.now() - new Date(status.ceYearStart + "T00:00:00Z").getTime()) / (86_400_000 * 30))))
    : 0;
  const expected = Math.min(status.goalHours, (status.goalHours * monthsIn) / 12);
  const behind = status.hoursThisYear + 0.001 < expected;
  const currentMonthDone = status.currentModule?.status === "completed";
  // Only nag when behind OR no current-month module completed.
  if (!behind && currentMonthDone) return null;

  const tone = behind ? "border-amber-300/50 bg-amber-500/5" : "border-primary/25 bg-primary/5";
  const iconTone = behind ? "text-amber-600" : "text-primary";

  return (
    <div className={`rounded-2xl border ${tone} p-4 shadow-[var(--shadow-card)]`}>
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background ${iconTone}`}>
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            {behind ? "You're behind on continuing education" : "Continuing Education due this month"}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {status.hoursThisYear.toFixed(1)} of {status.goalHours} hours done · {remaining.toFixed(1)} hours left ·
            {" "}{status.daysLeftInYear} days left in your CE year.
          </p>
        </div>
        <Button asChild size="sm" variant={behind ? "default" : "outline"} className="shrink-0">
          <Link to="/dashboard/courses/ce">
            Start <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
