/**
 * Staff phone clock-out deep link.
 *
 * Both the green clock bar CLOCK OUT chip and caseload "End shift" /
 * "Return to shift" must open the Shift Verification form (goals +
 * progress note + Submit Timeclock). PunchPad auto-opens that modal when
 * `verify=1`. Do not send a clocked-in staff member to a bare clock-in
 * tab, Hub, or punch-pad start screen.
 */
export type StaffClockOutSearch = {
  tab: "clock-in";
  verify: "1";
  code?: string;
};

export function staffClockOutSearch(code?: string | null): StaffClockOutSearch {
  const trimmed = String(code ?? "").trim();
  if (trimmed) {
    return { tab: "clock-in", verify: "1", code: trimmed };
  }
  return { tab: "clock-in", verify: "1" };
}
