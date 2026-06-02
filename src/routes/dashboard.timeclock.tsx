import { createFileRoute } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import { GeneralTimeClock } from "@/components/staff-mobile/general-time-clock";
import { StaffPageHeader } from "@/components/staff-mobile/staff-page-header";

export const Route = createFileRoute("/dashboard/timeclock")({
  head: () => ({ meta: [{ title: "General Time Clock — HIVE" }] }),
  component: TimeClockPage,
});

function TimeClockPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      <StaffPageHeader
        eyebrow="Time · Non-client"
        eyebrowIcon={Clock}
        title="General Time Clock"
        subtitle="Training, Admin, Travel, or Meeting time only. To start a client shift with EVV, open My Caseload and tap a client."
      />

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
        <GeneralTimeClock />
      </div>
    </div>
  );
}
