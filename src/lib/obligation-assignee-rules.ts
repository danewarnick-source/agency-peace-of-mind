// Duty-specific assignee narrowing. Service-code overlap is handled
// separately; these rules catch SOW duties that apply to a *subset* of
// staff even when the obligation is assigned to All Staff.

export function dutyRequiresTransporter(title: string): boolean {
  return title.startsWith("Driving Record");
}

export function dutyRequiresBehaviorCaseload(title: string): boolean {
  return title.startsWith("Behavior Intervention Certification");
}

export function dutyRequiresAbiCaseload(title: string): boolean {
  return title.startsWith("ABI Training");
}

/** Org-level duties that must generate one instance per home, not one for the agency. */
export function perHomeServiceCode(title: string): string | null {
  if (
    title === "HHS Home Certification — Annual (DSPD Form)" ||
    title === "HHS Quarterly Evacuation Drills — All Sites"
  ) {
    return "HHS";
  }
  if (title === "RHS Quarterly Evacuation Drills — All Sites") return "RHS";
  if (title === "PPS Quarterly Evacuation Drills — All Sites") return "PPS";
  return null;
}

export function homePeriodKey(teamName: string, teamId: string, catalogPeriodKey: string): string {
  return `${teamName} [${teamId.slice(0, 8)}] — ${catalogPeriodKey}`;
}
