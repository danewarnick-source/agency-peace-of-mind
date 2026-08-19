export type Role = "super_admin" | "admin" | "manager" | "employee" | "committee_member";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Platform Admin", // internal only, never shown in provider UI
  admin: "Owner",
  manager: "Supervisor",
  employee: "Staff",
  committee_member: "Committee Member",
};

export const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin: "/admin",
  manager: "/manager",
  employee: "/employee",
  committee_member: "/dashboard/hrc",
};

/** Section labels for the UI — used to group permissions in the matrix. */
export const PERMISSION_SECTIONS: Record<string, string> = {
  people: "Staff & People",
  clients: "Clients",
  scheduling: "Scheduling",
  timesheets: "Timesheets & EVV",
  documentation: "Documentation",
  compliance: "Compliance & Obligations",
  incidents: "Incidents",
  medications: "Medications",
  hrc: "HRC",
  financial: "Financial",
  organization: "Organization",
};

/**
 * Every permission key maps to one section for the matrix UI.
 * Includes the original coarse permission set (still gating ~40 existing
 * routes via RequirePermission/can()) alongside the new granular set —
 * this is additive, not a replacement, so existing route guards keep working.
 */
export const PERMISSION_SECTION_MAP: Record<string, string> = {
  // People
  invite_staff: "people",
  view_staff_records: "people",
  edit_staff_records: "people",
  manage_staff_roles: "people",
  deactivate_staff: "people",
  view_staff_documents: "people",
  upload_staff_documents: "people",
  approve_staff_documents: "people",
  // Clients
  view_clients: "clients",
  edit_client_records: "clients",
  manage_client_intake: "clients",
  view_client_medical: "clients",
  edit_client_medical: "clients",
  view_client_documents: "clients",
  manage_client_documents: "clients",
  manage_client_goals: "clients",
  // Scheduling
  view_schedule: "scheduling",
  create_shifts: "scheduling",
  edit_shifts: "scheduling",
  delete_shifts: "scheduling",
  approve_shift_swaps: "scheduling",
  manage_recurring_shifts: "scheduling",
  // Timesheets
  view_own_timesheets: "timesheets",
  view_team_timesheets: "timesheets",
  view_all_timesheets: "timesheets",
  approve_timesheets: "timesheets",
  edit_timesheets: "timesheets",
  export_evv: "timesheets",
  // Documentation
  submit_shift_notes: "documentation",
  edit_shift_notes: "documentation",
  approve_shift_notes: "documentation",
  view_daily_logs: "documentation",
  submit_daily_logs: "documentation",
  approve_daily_logs: "documentation",
  manage_forms: "documentation",
  submit_forms: "documentation",
  view_form_submissions: "documentation",
  approve_form_submissions: "documentation",
  // Compliance
  view_compliance_dashboard: "compliance",
  complete_obligations: "compliance",
  file_staff_documents: "compliance",
  manage_obligations: "compliance",
  view_audit_trail: "compliance",
  // Incidents
  report_incidents: "incidents",
  view_incidents: "incidents",
  manage_incidents: "incidents",
  export_incident_reports: "incidents",
  // Medications
  view_emar: "medications",
  submit_emar: "medications",
  manage_medications: "medications",
  // HRC
  view_hrc: "hrc",
  manage_hrc: "hrc",
  // Financial
  view_billing: "financial",
  manage_billing: "financial",
  view_payroll: "financial",
  manage_payroll: "financial",
  view_financial_reports: "financial",
  export_financial_reports: "financial",
  // Organization
  manage_organization_settings: "organization",
  manage_service_codes: "organization",
  view_analytics: "organization",
  export_reports: "organization",
  manage_permissions: "organization",

  // --- Legacy permission set (kept: still gates existing routes) ---
  manage_roles: "organization",
  assign_training: "people",
  create_courses: "people",
  edit_courses: "people",
  manage_certifications: "people",
  manage_programs: "people",
  approve_external_certs: "people",
  upload_external_certs: "people",
  view_team_reports: "people",
  manage_organization: "organization",
  view_own_training: "people",
  view_certifications: "people",
  view_platform_metrics: "organization",
  manage_all_orgs: "organization",
  view_financial_tns_gross: "financial",
  view_financial_rhs: "financial",
  view_financial_employees: "financial",
  view_referrals: "clients",
  manage_referrals: "clients",
  send_emails: "organization",
};

export const ALL_PERMISSIONS = Object.keys(PERMISSION_SECTION_MAP) as Permission[];
export type Permission = keyof typeof PERMISSION_SECTION_MAP;

export const PERMISSION_LABEL: Record<Permission, string> = {
  // People
  invite_staff: "Invite staff",
  view_staff_records: "View staff records",
  edit_staff_records: "Edit staff records",
  manage_staff_roles: "Manage staff roles",
  deactivate_staff: "Deactivate staff",
  view_staff_documents: "View staff documents",
  upload_staff_documents: "Upload staff documents",
  approve_staff_documents: "Approve staff documents",
  // Clients
  view_clients: "View clients",
  edit_client_records: "Edit client records",
  manage_client_intake: "Manage client intake",
  view_client_medical: "View client medical info",
  edit_client_medical: "Edit client medical info",
  view_client_documents: "View client documents",
  manage_client_documents: "Manage client documents",
  manage_client_goals: "Manage client goals",
  // Scheduling
  view_schedule: "View schedule",
  create_shifts: "Create shifts",
  edit_shifts: "Edit shifts",
  delete_shifts: "Delete shifts",
  approve_shift_swaps: "Approve shift swaps",
  manage_recurring_shifts: "Manage recurring shifts",
  // Timesheets
  view_own_timesheets: "View own timesheets",
  view_team_timesheets: "View team timesheets",
  view_all_timesheets: "View all timesheets",
  approve_timesheets: "Approve timesheets",
  edit_timesheets: "Edit timesheets",
  export_evv: "Export EVV data",
  // Documentation
  submit_shift_notes: "Submit shift notes",
  edit_shift_notes: "Edit shift notes",
  approve_shift_notes: "Approve shift notes",
  view_daily_logs: "View daily logs",
  submit_daily_logs: "Submit daily logs",
  approve_daily_logs: "Approve daily logs",
  manage_forms: "Manage forms",
  submit_forms: "Submit forms",
  view_form_submissions: "View form submissions",
  approve_form_submissions: "Approve form submissions",
  // Compliance
  view_compliance_dashboard: "View compliance dashboard",
  complete_obligations: "Complete obligations",
  file_staff_documents: "File staff documents",
  manage_obligations: "Manage obligations",
  view_audit_trail: "View audit trail",
  // Incidents
  report_incidents: "Report incidents",
  view_incidents: "View incidents",
  manage_incidents: "Manage incidents",
  export_incident_reports: "Export incident reports",
  // Medications
  view_emar: "View eMAR",
  submit_emar: "Submit eMAR",
  manage_medications: "Manage medications",
  // HRC
  view_hrc: "View HRC",
  manage_hrc: "Manage HRC",
  // Financial
  view_billing: "View billing",
  manage_billing: "Manage billing",
  view_payroll: "View payroll",
  manage_payroll: "Manage payroll",
  view_financial_reports: "View financial reports",
  export_financial_reports: "Export financial reports",
  // Organization
  manage_organization_settings: "Manage organization settings",
  manage_service_codes: "Manage service codes",
  view_analytics: "View analytics",
  export_reports: "Export reports",
  manage_permissions: "Manage permissions",

  // Legacy
  manage_roles: "Manage roles & permissions (legacy)",
  assign_training: "Assign training",
  create_courses: "Create courses",
  edit_courses: "Edit courses",
  manage_certifications: "Manage certifications",
  manage_programs: "Manage training programs",
  approve_external_certs: "Approve external certifications",
  upload_external_certs: "Upload external certifications",
  view_team_reports: "View team reports",
  manage_organization: "Manage organization (legacy)",
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
};

/** Default permission matrix used to seed org-specific role_permissions rows. */
export const DEFAULT_MATRIX: Record<Role, Permission[]> = {
  super_admin: [...ALL_PERMISSIONS],

  admin: [...ALL_PERMISSIONS], // owner starts with everything on

  manager: [
    // New granular set — operational access, not financial or org settings
    "invite_staff", "view_staff_records", "view_staff_documents", "upload_staff_documents",
    "view_clients", "edit_client_records", "view_client_medical", "view_client_documents",
    "manage_client_documents", "manage_client_goals",
    "view_schedule", "create_shifts", "edit_shifts", "approve_shift_swaps",
    "view_own_timesheets", "view_team_timesheets", "approve_timesheets",
    "submit_shift_notes", "edit_shift_notes", "view_daily_logs", "submit_daily_logs",
    "submit_forms", "view_form_submissions",
    "view_compliance_dashboard", "complete_obligations", "file_staff_documents",
    "report_incidents", "view_incidents",
    "view_emar", "submit_emar",
    "view_hrc",
    "view_analytics",
    // Legacy set — preserves existing manager behavior
    "assign_training", "view_team_reports", "approve_external_certs",
    "upload_external_certs", "view_own_training", "view_certifications",
    "manage_incidents",
  ],

  employee: [
    // New granular set
    "view_own_timesheets", "submit_shift_notes", "submit_daily_logs",
    "submit_forms", "complete_obligations",
    "report_incidents", "view_emar", "submit_emar",
    // Legacy set
    "view_own_training", "view_certifications", "upload_external_certs",
  ],

  committee_member: [
    "view_hrc", "manage_hrc",
  ],
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
