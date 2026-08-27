import { CASELOAD } from "./fixtures";
import { LAUNCHPAD_CLOCK_IN_BLOCKED_MESSAGE } from "@/lib/launchpad-gate";

export function PunchPadClockInStage({
  clientId,
  serviceCode,
}: {
  clientId: string;
  serviceCode?: string;
}) {
  const client = CASELOAD.find((c) => c.id === clientId);
  const name = client ? `${client.first_name} ${client.last_name}` : clientId;
  const gpsMode = window.__e2e.gpsMode;
  const gpsOk = gpsMode === "ok";
  const launchpadOk = window.__e2e.hasPassedLaunchpad;
  const canClockIn = gpsOk && launchpadOk;

  function clockIn() {
    if (!canClockIn) return;
    window.__e2e.clockInCalls.push({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      clientId,
      serviceCode: serviceCode ?? "SEI",
      gps: { latitude: 40.7608, longitude: -111.891, accuracyMeters: 12 },
    });
    window.__e2e.timesheetWrites += 1;
  }

  return (
    <main data-e2e-scene="punch-pad-clock-in">
      <h1>Punch pad</h1>
      <p>
        Clock in with <strong>{name}</strong>
        {serviceCode ? ` for ${serviceCode}` : ""}.
      </p>
      <p data-e2e-timesheet-writes={window.__e2e.timesheetWrites}>
        Timesheet writes: {window.__e2e.timesheetWrites}
      </p>
      {!gpsOk && (
        <p>GPS fail closed — punch pad did not write a timesheet. Location is required to clock in.</p>
      )}
      {!launchpadOk && <p>{LAUNCHPAD_CLOCK_IN_BLOCKED_MESSAGE}</p>}
      <button type="button" disabled={!canClockIn} onClick={clockIn}>
        Clock in
      </button>
    </main>
  );
}
