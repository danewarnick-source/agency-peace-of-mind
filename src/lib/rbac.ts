export type Role = "super_admin" | "admin" | "manager" | "employee" | "committee_member";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Company Admin",
  manager: "Manager",
  employee: "Employee",
  committee_member: "Committee Member",
};

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  manager: "/manager",
  employee: "/employee",
  committee_member: "/dashboard/hrc",
};

/** Canonical list of permission keys. Add to this list to expose a new toggle. */
export const ALL_PERMISSIONS = [
  "manage_users",
  "invite_users",
  "remove_users",
  "manage_roles",
  "assign_training",
  "create_courses",
  "edit_courses",
  "manage_certifications",
  "manage_programs",
  "approve_external_certs",
  "upload_external_certs",
  "export_reports",
  "view_analytics",
  "view_team_reports",
  "manage_billing",
  "view_billing",
  "manage_organization",
  "view_own_training",
  "view_certifications",
  "view_platform_metrics",
  "manage_all_orgs",
  "view_financial_tns_gross",
  "view_financial_rhs",
  "view_financial_employees",
  "view_referrals",
  "manage_referrals",
  "send_emails",
  "manage_schedule",
  "manage_incidents",
] as const;


export type Permission = (typeof ALL_PERMISSIONS)[number];

export const PERMISSION_LABEL: Record<Permission, string> = {
  manage_users: "Manage users",
  invite_users: "Invite users",
  remove_users: "Remove users",
  manage_roles: "Manage roles & permissions",
  assign_training: "Assign training",
  create_courses: "Create courses",
  edit_courses: "Edit courses",
  manage_certifications: "Manage certifications",
  manage_programs: "Manage training programs",
  approve_external_certs: "Approve external certifications",
  upload_external_certs: "Upload external certifications",
  export_reports: "Export reports",
  view_analytics: "View analytics",
  view_team_reports: "View team reports",
  manage_billing: "Manage billing",
  view_billing: "View billing",
  manage_organization: "Manage organization",
  view_own_training: "View own training",
  view_certifications: "View certifications",
  view_platform_metrics: "View platform metrics",
  manage_all_orgs: "Manage all organizations",
  view_financial_tns_gross: "View Financial — Gross",
  view_financial_rhs: "View Financial — RHS",
  view_financial_employees: "View Financial — Employees",
  view_referrals: "View referrals (CRM)",
  manage_referrals: "Manage referrals (CRM)",
  send_emails: "Send emails (Resend rail)",
  manage_schedule: "Manage schedule (create/edit shifts)",
  manage_incidents: "Manage incidents (report/edit)",
};


/** Default permission matrix used to seed org-specific overrides. */
export const DEFAULT_MATRIX: Record<Role, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],
  admin: [
    "manage_users", "invite_users", "remove_users", "manage_roles",
    "assign_training", "create_courses", "edit_courses", "manage_certifications",
    "manage_programs", "approve_external_certs", "upload_external_certs",
    "export_reports", "view_analytics", "view_team_reports",
    "manage_billing", "view_billing", "manage_organization",
    "view_own_training", "view_certifications",
    "view_financial_tns_gross",
    "view_financial_rhs",
    "view_financial_employees",
    "view_referrals",
    "manage_referrals",
    "send_emails",
  ],


  manager: [
    "invite_users", "assign_training", "view_team_reports", "approve_external_certs",
    "upload_external_certs", "view_analytics", "view_own_training", "view_certifications",
  ],
  employee: ["view_own_training", "view_certifications", "upload_external_certs"],
  committee_member: [],
};

export function defaultCan(role: Role | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  return DEFAULT_MATRIX[role].includes(perm);
}

export function hasAnyRole(role: Role | undefined | null, roles: Role[]): boolean {
  return !!role && roles.includes(role);
}

/** Back-compat alias used by older components. */
export const can = defaultCan;
