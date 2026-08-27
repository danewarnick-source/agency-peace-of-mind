import { CASELOAD } from "./fixtures";

export function PunchPadClockInStage({
  clientId,
  serviceCode,
}: {
  clientId: string;
  serviceCode?: string;
}) {
  const client = CASELOAD.find((c) => c.id === clientId);
  const name = client ? `${client.first_name} ${client.last_name}` : clientId;
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
      <p>GPS fail closed — Compass did not write a timesheet. Complete clock-in here.</p>
    </main>
  );
}
