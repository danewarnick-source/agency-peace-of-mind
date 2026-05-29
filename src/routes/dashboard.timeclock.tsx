import { createFileRoute } from "@tanstack/react-router";
import { PunchPad } from "@/components/evv/punch-pad";
import { useCaseload } from "@/hooks/use-caseload";

export const Route = createFileRoute("/dashboard/timeclock")({
  head: () => ({ meta: [{ title: "General Time Clock — HIVE" }] }),
  component: TimeClockPage,
});

function TimeClockPage() {
  const { data: caseload = [], isLoading } = useCaseload();

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-3 sm:px-0">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">⏱️ General Time Clock</h1>
        <p className="text-sm text-muted-foreground">
          Unscheduled EVV punch — assign a facility, client, and Medicaid billing code before starting.
        </p>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading caseload…</p>
      ) : (
        <PunchPad
          entryType="General_Sidebar_Unscheduled"
          caseload={caseload.map((c) => ({
            id: c.id,
            first_name: c.first_name,
            last_name: c.last_name,
            medicaid_id: c.medicaid_id,
            physical_address: c.physical_address,
          }))}
        />
      )}
    </div>
  );
}
