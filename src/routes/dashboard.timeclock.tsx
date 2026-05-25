import { createFileRoute } from "@tanstack/react-router";
import { EvvShiftControl } from "@/components/evv-shift-control";
import { AdminTimeClockView } from "@/components/admin-time-clock";
import { useEffectiveView } from "@/hooks/use-effective-view";

export const Route = createFileRoute("/dashboard/timeclock")({
  head: () => ({ meta: [{ title: "Time Clock — Care Academy" }] }),
  component: TimeClockPage,
});

function TimeClockPage() {
  const { effective } = useEffectiveView();

  if (effective === "admin") {
    return (
      <div className="space-y-8">
        <div className="mx-auto max-w-2xl space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">My Time Clock</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Clock yourself in for a shift. Admin oversight is shown below.
            </p>
          </div>
          <EvvShiftControl />
        </div>
        <AdminTimeClockView />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Time Clock</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Federally compliant EVV clock-in and clock-out with GPS verification, geofence enforcement, and mandatory shift documentation.
        </p>
      </div>
      <EvvShiftControl />
    </div>
  );
}
