import { createFileRoute } from "@tanstack/react-router";
import { GeneralTimeClock } from "@/components/staff-mobile/general-time-clock";

export const Route = createFileRoute("/dashboard/timeclock")({
  head: () => ({ meta: [{ title: "General Time Clock — HIVE" }] }),
  component: TimeClockPage,
});

function TimeClockPage() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-3 sm:px-0">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">⏱️ General Time Clock</h1>
        <p className="text-sm text-muted-foreground">
          Non-client work only — Training, Admin, Travel, or Meeting time. To
          start a client shift with EVV, open My Caseload and tap a client.
        </p>
      </header>

      <GeneralTimeClock />
    </div>
  );
}
