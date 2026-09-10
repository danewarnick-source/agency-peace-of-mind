/**
 * Admin Employees roster split.
 *
 * Soft-deactivate already lives on existing columns — no migration:
 *   - organization_members.active (list Deactivate / Reactivate)
 *   - profiles.is_active (hire + archiveEntity)
 *   - profiles.account_status 'active' | 'archived' (archiveEntity / LifecyclePanel)
 *
 * Active tab = operational roster. Inactive = deactivated or archived.
 * They must never mix.
 */

export type EmployeeRosterTab = "active" | "inactive";

export type EmployeeRosterProfile = {
  account_status?: string | null;
  is_active?: boolean | null;
};

export type EmployeeRosterMember = {
  active: boolean;
  profile?: EmployeeRosterProfile | null;
};

/** True only when the member belongs on the Active Employees tab. */
export function isEmployeeOnActiveRoster(member: EmployeeRosterMember): boolean {
  if (!member.active) return false;
  const profile = member.profile;
  if ((profile?.account_status ?? "active") === "archived") return false;
  if (profile?.is_active === false) return false;
  return true;
}

export function filterEmployeesByRosterTab<T extends EmployeeRosterMember>(
  members: readonly T[] | null | undefined,
  tab: EmployeeRosterTab,
): T[] {
  return (members ?? []).filter((m) =>
    tab === "active" ? isEmployeeOnActiveRoster(m) : !isEmployeeOnActiveRoster(m),
  );
}

export function countEmployeesOnRosterTab(
  members: readonly EmployeeRosterMember[] | null | undefined,
  tab: EmployeeRosterTab,
): number {
  return filterEmployeesByRosterTab(members, tab).length;
}

export function uniqueHireEmails(emails: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) return email;
    seen.add(email);
  }
  return null;
}
