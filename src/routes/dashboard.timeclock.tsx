import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, Sparkles, GraduationCap } from "lucide-react";
import { GeneralTimeClock } from "@/components/staff-mobile/general-time-clock";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/timeclock")({
  head: () => ({ meta: [{ title: "General Time Clock — HIVE" }] }),
  component: TimeClockPage,
});

function TimeClockPage() {
  return (
    <div className="mx-auto w-full max-w-xl">
      <StaffPageHeader
        eyebrow="Time · Non-client"
        eyebrowIcon={Clock}
        title="General Time Clock"
        subtitle="Training, Admin, Travel, or Meeting time only. To start a client shift with EVV, open My Caseload and tap a client."
      />

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Link
          to="/dashboard/ask-nectar"
          className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2.5 text-left transition hover:bg-accent/10"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-foreground">Ask Nectar about training</span>
            <span className="block text-[10px] text-muted-foreground">Get answers + open the topic</span>
          </span>
        </Link>
        <Link
          to="/dashboard/courses"
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:bg-muted/50"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-foreground">Review my trainings</span>
            <span className="block text-[10px] text-muted-foreground">Core & person-specific</span>
          </span>
        </Link>
      </div>

      <GeneralTimeClock />
    </div>
  );
}
