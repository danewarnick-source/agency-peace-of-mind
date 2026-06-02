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
    <div className="mx-auto w-full max-w-xl">
      <StaffPageHeader
        eyebrow="Time · Non-client"
        eyebrowIcon={Clock}
        title="General Time Clock"
        subtitle="Training, Admin, Travel, or Meeting time only. To start a client shift with EVV, open My Caseload and tap a client."
      />

      <GeneralTimeClock />
    </div>
  );
}
