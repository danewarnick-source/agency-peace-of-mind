export type Role = "super_admin" | "admin" | "manager" | "employee";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Company Admin",
  manager: "Manager",
  employee: "Employee",
};

/** Default landing path for each role after login. */
export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  manager: "/manager",
  employee: "/employee",
};

/** Permission keys used across the dashboard. */
export type Permission =
  | "view_platform_metrics"
  | "manage_all_orgs"
  | "manage_employees"
  | "manage_roles"
  | "manage_courses"
  | "assign_training"
  | "view_org_reports"
  | "view_team_reports"
  | "manage_billing"
  | "view_billing"
  | "view_own_training"
  | "view_certifications";

const MATRIX: Record<Role, Permission[]> = {
  super_admin: [
    "view_platform_metrics", "manage_all_orgs",
    "manage_employees", "manage_courses", "assign_training",
    "view_org_reports", "view_team_reports",
    "manage_billing", "view_billing",
    "view_own_training", "view_certifications",
  ],
  admin: [
    "manage_employees", "manage_courses", "assign_training",
    "view_org_reports", "view_team_reports",
    "manage_billing", "view_billing",
    "view_own_training", "view_certifications",
  ],
  manager: [
    "assign_training", "view_team_reports",
    "view_own_training", "view_certifications",
  ],
  employee: ["view_own_training", "view_certifications"],
};

export function can(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return MATRIX[role].includes(perm);
}

export function hasAnyRole(role: Role | undefined | null, roles: Role[]): boolean {
  return !!role && roles.includes(role);
}
