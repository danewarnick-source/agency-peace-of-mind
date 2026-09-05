/**
 * Playwright mock layer for Admin Home / obligations E2E.
 *
 * Injects a fake Supabase session for True North Supports and intercepts
 * browser traffic to Supabase + TanStack Start server functions so the
 * suite never reads or writes live obligation rows.
 *
 * TNS_ORG_ID matches the production True North Supports LLC UUID. This
 * file is mock-only — do not flip flags or run experimental writes there.
 */
import type { Page, Route } from "@playwright/test";
import { ALL_PERMISSIONS } from "../../src/lib/rbac";
import {
  LOCKED_PACK_KEYS,
  LOCKED_PACK_LABEL,
  packCellStatus,
  packColumnForObligation,
  staffInitials,
} from "../../src/lib/obligation-packs";

export const TNS_ORG_ID = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";
export const ADMIN_USER_ID = "e2e00000-0000-4000-a000-000000000001";
export const DSP_USER_ID = "e2e00000-0000-4000-a000-000000000002";
export const STAFF_USER_ID = "e2e00000-0000-4000-a000-000000000003";
export const CLIENT_ID = "e2e00000-0000-4000-a000-000000000010";

export const OB_OVERDUE_ID = "e2e00000-0000-4000-a000-000000000021";
export const OB_DUE_ID = "e2e00000-0000-4000-a000-000000000022";
export const OB_DONE_ID = "e2e00000-0000-4000-a000-000000000023";
export const OB_PAUSED_ID = "e2e00000-0000-4000-a000-000000000024";
export const OB_CONDUCT_ID = "e2e00000-0000-4000-a000-000000000025";
export const OB_THIRTY_ID = "e2e00000-0000-4000-a000-000000000026";
export const OB_CLIENT_ID = "e2e00000-0000-4000-a000-000000000027";

export const INST_OVERDUE_ID = "e2e00000-0000-4000-a000-000000000031";
export const INST_DUE_ID = "e2e00000-0000-4000-a000-000000000032";
export const INST_DONE_ID = "e2e00000-0000-4000-a000-000000000033";
export const INST_CONDUCT_ID = "e2e00000-0000-4000-a000-000000000034";
export const INST_THIRTY_ID = "e2e00000-0000-4000-a000-000000000035";
export const INST_CLIENT_ID = "e2e00000-0000-4000-a000-000000000036";

const PROJECT_REF = "mmknqtdrefbzwfdtykza";
const SUPABASE_HOST = `${PROJECT_REF}.supabase.co`;
const AUTH_STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

export type MockPersona = "admin" | "employee";

let mockIsExecutive = false;
let mockWelcomeIncomplete = false;

export type HiveMockOptions = {
  role?: MockPersona;
  isExecutive?: boolean;
  /** Young org with no documented shifts — banner chips stay incomplete. */
  welcomeIncomplete?: boolean;
};

const isoDaysFromNow = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const ORG = {
  name: "True North Supports",
  is_demo: false,
  legal_name: "True North Supports LLC",
  dba_name: "True North Supports",
  display_acronym: "TNS",
  services_offered: ["HHS", "SLH", "SLN", "SEI", "DSI"],
  created_at: "2025-01-15T00:00:00.000Z",
  welcome_dismissed_at: null as string | null,
};

const EMPTY_AUDIT_EVIDENCE = {
  generated_at: new Date().toISOString(),
  items: {},
  people: [],
  homes: [],
};

const EMPTY_AUDIT_SUMMARY = {
  generatedAt: new Date().toISOString(),
  scope: {},
  totals: { critical: 0, attention: 0, minor: 0, total: 0 },
  readinessScore: 92,
  byArea: {
    documentation: 0,
    daily_logs: 0,
    evv_timesheets: 0,
    billing: 0,
    staff_certifications: 0,
    requirements_engine: 0,
    external_attestations: 0,
  },
  findings: [],
};

const FEATURE_KEYS = [
  "hive_training",
  "nectar",
  "state_audit",
  "pba_ledgers",
  "evv_timesheets",
  "client_intake",
  "pcsp",
  "staff_onboarding",
] as const;

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fakeJwt(userId: string, email: string): string {
  const header = b64url({ alg: "none", typ: "JWT" });
  const payload = b64url({
    iss: `https://${SUPABASE_HOST}/auth/v1`,
    sub: userId,
    aud: "authenticated",
    role: "authenticated",
    email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    iat: Math.floor(Date.now() / 1000),
  });
  return `${header}.${payload}.e2e`;
}

function userRecord(persona: MockPersona) {
  const id = persona === "admin" ? ADMIN_USER_ID : DSP_USER_ID;
  const email =
    persona === "admin" ? "e2e.admin@truenorth.example" : "e2e.dsp@truenorth.example";
  const now = new Date().toISOString();
  return {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: now,
    phone: "",
    confirmed_at: now,
    last_sign_in_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {
      full_name: persona === "admin" ? "Dana Admin" : "Alex DSP",
      first_name: persona === "admin" ? "Dana" : "Alex",
    },
    identities: [],
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}

function sessionRecord(persona: MockPersona) {
  const user = userRecord(persona);
  const access_token = fakeJwt(user.id, user.email);
  return {
    access_token,
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    refresh_token: "e2e-refresh-token",
    user,
  };
}

function corsHeaders(origin?: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, accept, prefer, x-supabase-api-version, range",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Expose-Headers": "content-range, x-supabase-api-version, prefer",
    "Access-Control-Max-Age": "86400",
  };
}

function makeObligation(partial: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    organization_id: TNS_ORG_ID,
    description: null,
    source_policy_section: "DHHS91172",
    cadence: "annually",
    due_day_config: {},
    reminder_days_before: [14, 7],
    evidence_type: "upload",
    linked_form_id: null,
    attestation_text: null,
    requires_individual_completion: false,
    assigned_to_groups: [],
    assigned_to_users: [],
    assignee_role: "admin_only",
    notify_manager_on_complete: true,
    notify_manager_on_overdue: true,
    active: true,
    source: "sow",
    is_locked: true,
    scope: "org",
    target_service_codes: [],
    nectar_cert_type_label: null,
    nectar_keyword_groups: null,
    created_by: ADMIN_USER_ID,
    created_at: now,
    updated_at: now,
    current_instance: null,
    rollup: {
      open_count: 0,
      overdue_count: 0,
      pending_count: 0,
      next_due_at: null,
      latest_completed_at: null,
    },
    ...partial,
  };
}

function makeInstance(partial: Record<string, unknown>) {
  const now = new Date().toISOString();
  return {
    organization_id: TNS_ORG_ID,
    period_key: "2026-Q3",
    completed_at: null,
    completed_by_id: null,
    completed_by_name: null,
    evidence_type_used: null,
    upload_path: null,
    upload_filename: null,
    attestation_signed_at: null,
    attestation_signed_by_id: null,
    attestation_signed_by_name: null,
    attestation_text_snapshot: null,
    form_submission_id: null,
    event_description: null,
    waive_reason: null,
    admin_notes: null,
    assignee_staff_id: null,
    client_id: null,
    client_name: null,
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

function fixtures() {
  const overdueDue = isoDaysFromNow(-12);
  const soonDue = isoDaysFromNow(5);
  const doneAt = isoDaysFromNow(-20);

  const instOverdue = makeInstance({
    id: INST_OVERDUE_ID,
    obligation_id: OB_OVERDUE_ID,
    due_at: overdueDue,
    status: "overdue",
    period_key: "2026",
  });
  const instDue = makeInstance({
    id: INST_DUE_ID,
    obligation_id: OB_DUE_ID,
    due_at: soonDue,
    status: "pending",
    period_key: "2026",
    assignee_staff_id: STAFF_USER_ID,
  });
  const instDone = makeInstance({
    id: INST_DONE_ID,
    obligation_id: OB_DONE_ID,
    due_at: isoDaysFromNow(-3),
    status: "completed",
    completed_at: doneAt,
    completed_by_id: ADMIN_USER_ID,
    completed_by_name: "Dana Admin",
    period_key: "2026",
  });

  const overdue = makeObligation({
    id: OB_OVERDUE_ID,
    title: "Emergency Management and Business Continuity Plan",
    cadence: "annually",
    current_instance: instOverdue,
    rollup: {
      open_count: 1,
      overdue_count: 1,
      pending_count: 0,
      next_due_at: overdueDue,
      latest_completed_at: null,
    },
  });
  const due = makeObligation({
    id: OB_DUE_ID,
    title: "CPR/First Aid Certification — Initial",
    cadence: "one_time",
    scope: "staff",
    assignee_role: "any_assigned",
    assigned_to_users: [STAFF_USER_ID],
    current_instance: instDue,
    rollup: {
      open_count: 1,
      overdue_count: 0,
      pending_count: 1,
      next_due_at: soonDue,
      latest_completed_at: null,
    },
  });
  const done = makeObligation({
    id: OB_DONE_ID,
    title: "Internal Quality Management Plan",
    cadence: "annually",
    current_instance: instDone,
    rollup: {
      open_count: 0,
      overdue_count: 0,
      pending_count: 0,
      next_due_at: null,
      latest_completed_at: doneAt,
    },
  });
  const paused = makeObligation({
    id: OB_PAUSED_ID,
    title: "Staff handbook annual review",
    source: "provider",
    is_locked: false,
    active: false,
    source_policy_section: "Internal P&P",
    current_instance: null,
    rollup: {
      open_count: 0,
      overdue_count: 0,
      pending_count: 0,
      next_due_at: null,
      latest_completed_at: null,
    },
  });
  const instConduct = makeInstance({
    id: INST_CONDUCT_ID,
    obligation_id: OB_CONDUCT_ID,
    due_at: isoDaysFromNow(-2),
    status: "completed",
    completed_at: doneAt,
    completed_by_id: STAFF_USER_ID,
    completed_by_name: "Jordan Lee",
    period_key: "2026",
    assignee_staff_id: STAFF_USER_ID,
  });
  const instThirty = makeInstance({
    id: INST_THIRTY_ID,
    obligation_id: OB_THIRTY_ID,
    due_at: soonDue,
    status: "pending",
    period_key: "2026",
    assignee_staff_id: STAFF_USER_ID,
  });
  const instClient = makeInstance({
    id: INST_CLIENT_ID,
    obligation_id: OB_CLIENT_ID,
    due_at: soonDue,
    status: "overdue",
    period_key: "2026",
    assignee_staff_id: STAFF_USER_ID,
    client_id: CLIENT_ID,
    client_name: "Riley Chen",
  });
  const conduct = makeObligation({
    id: OB_CONDUCT_ID,
    title: "DHHS Code of Conduct — Signed",
    cadence: "one_time",
    scope: "staff",
    evidence_type: "attestation",
    assignee_role: "any_assigned",
    assigned_to_users: [STAFF_USER_ID],
    current_instance: instConduct,
    rollup: {
      open_count: 0,
      overdue_count: 0,
      pending_count: 0,
      next_due_at: null,
      latest_completed_at: doneAt,
    },
  });
  const thirty = makeObligation({
    id: OB_THIRTY_ID,
    title: "30-Day New Hire Orientation Training",
    cadence: "one_time",
    scope: "staff",
    evidence_type: "form",
    assignee_role: "any_assigned",
    assigned_to_users: [STAFF_USER_ID],
    current_instance: instThirty,
    rollup: {
      open_count: 1,
      overdue_count: 0,
      pending_count: 1,
      next_due_at: soonDue,
      latest_completed_at: null,
    },
  });
  const clientTraining = makeObligation({
    id: OB_CLIENT_ID,
    title: "Client-Specific Training — [Client Name]",
    cadence: "one_time",
    scope: "staff_per_client",
    evidence_type: "form",
    assignee_role: "any_assigned",
    assigned_to_users: [STAFF_USER_ID],
    current_instance: instClient,
    rollup: {
      open_count: 1,
      overdue_count: 1,
      pending_count: 0,
      next_due_at: soonDue,
      latest_completed_at: null,
    },
  });

  return {
    obligations: [overdue, due, done, paused, conduct, thirty, clientTraining],
    instances: [instOverdue, instDue, instDone, instConduct, instThirty, instClient],
    overdue,
    due,
    done,
    paused,
    instOverdue,
    instDue,
    instDone,
  };
}

function featureRegistry() {
  return FEATURE_KEYS.map((key, i) => ({
    id: `e2e-feat-${i + 1}`,
    feature_key: key,
    label: key.replace(/_/g, " "),
    description: null,
    parent_key: null,
    category: "tab",
    default_enabled: true,
    sort_order: i,
    required_tier: null,
    upgrade_blurb: null,
  }));
}

function parsePostgrestFilters(url: URL): Array<{ col: string; op: string; value: string }> {
  const out: Array<{ col: string; op: string; value: string }> = [];
  for (const [key, raw] of url.searchParams.entries()) {
    if (key === "select" || key === "order" || key === "limit" || key === "offset" || key === "or") {
      continue;
    }
    const eq = raw.indexOf(".");
    if (eq < 0) continue;
    const op = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    out.push({ col: key, op, value });
  }
  return out;
}

function attachEmbeds(
  table: string,
  rows: Record<string, unknown>[],
  select: string,
  tables: Record<string, Record<string, unknown>[]>,
): Record<string, unknown>[] {
  if (table !== "company_obligation_instances") return rows;
  const wantsObligations = /company_obligations/.test(select);
  const wantsAssignees = /company_obligation_instance_assignees/.test(select);
  const wantsCompletions = /company_obligation_completions/.test(select);
  if (!wantsObligations && !wantsAssignees && !wantsCompletions) return rows;

  return rows.map((row) => {
    const next = { ...row };
    if (wantsObligations) {
      const ob = (tables.company_obligations ?? []).find((o) => o.id === row.obligation_id);
      next.company_obligations = ob
        ? {
            title: ob.title,
            source_policy_section: ob.source_policy_section,
            scope: ob.scope,
          }
        : null;
    }
    if (wantsAssignees) {
      next.company_obligation_instance_assignees = (
        tables.company_obligation_instance_assignees ?? []
      ).filter((a) => a.instance_id === row.id);
    }
    if (wantsCompletions) {
      next.company_obligation_completions = (tables.company_obligation_completions ?? []).filter(
        (c) => c.instance_id === row.id,
      );
    }
    return next;
  });
}

function rowMatches(row: Record<string, unknown>, filters: ReturnType<typeof parsePostgrestFilters>) {
  for (const f of filters) {
    const cell = row[f.col];
    if (f.op === "eq") {
      if (String(cell) !== f.value) return false;
    } else if (f.op === "neq") {
      if (String(cell) === f.value) return false;
    } else if (f.op === "in") {
      const inner = f.value.replace(/^\(/, "").replace(/\)$/, "");
      const vals = inner.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
      if (!vals.includes(String(cell))) return false;
    } else if (f.op === "is") {
      const wantNull = f.value === "null";
      if (wantNull && cell != null) return false;
      if (!wantNull && cell == null) return false;
    }
  }
  return true;
}

function tableRows(persona: MockPersona, fx: ReturnType<typeof fixtures>): Record<string, Record<string, unknown>[]> {
  const user = userRecord(persona);
  const role = persona === "admin" ? "admin" : "employee";
  const first = persona === "admin" ? "Dana" : "Alex";
  const full = persona === "admin" ? "Dana Admin" : "Alex DSP";

  const members = [
    {
      id: `mem-${user.id}`,
      user_id: user.id,
      organization_id: TNS_ORG_ID,
      role,
      job_title: persona === "admin" ? "Owner" : "DSP",
      active: true,
      organizations: ORG,
    },
    {
      id: `mem-${STAFF_USER_ID}`,
      user_id: STAFF_USER_ID,
      organization_id: TNS_ORG_ID,
      role: "employee",
      job_title: "DSP",
      active: true,
      organizations: ORG,
    },
  ];

  const profiles = [
    {
      id: user.id,
      first_name: first,
      last_name: persona === "admin" ? "Admin" : "DSP",
      full_name: full,
      email: user.email,
      must_change_password: false,
      staff_type_keys: persona === "admin" ? ["admin"] : ["dsp"],
      bc_role: null,
      // Launchpad (#179) is a clock-in gate, not an Admin Home wall.
      has_passed_launchpad: true,
    },
    {
      id: STAFF_USER_ID,
      first_name: "Jordan",
      last_name: "Lee",
      full_name: "Jordan Lee",
      email: "jordan.lee@truenorth.example",
      must_change_password: false,
      staff_type_keys: ["dsp"],
      bc_role: null,
      has_passed_launchpad: true,
    },
  ];

  const directory = profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    organization_id: TNS_ORG_ID,
  }));

  const rolePermissions =
    persona === "admin"
      ? ALL_PERMISSIONS.map((permission) => ({
          organization_id: TNS_ORG_ID,
          role: "admin",
          permission,
          enabled: true,
        }))
      : ALL_PERMISSIONS.map((permission) => ({
          organization_id: TNS_ORG_ID,
          role: "employee",
          permission,
          enabled: permission === "complete_obligations" || permission === "view_own_timesheets",
        }));

  const clients = [
    {
      id: CLIENT_ID,
      organization_id: TNS_ORG_ID,
      first_name: "Riley",
      last_name: "Chen",
      intake_status: "complete",
      account_status: "active",
      authorized_dspd_codes: ["HHS", "SLH", "DSI"],
      disability_category: null,
      has_abi: false,
      home_latitude: null,
      home_longitude: null,
      pcsp_goals: [],
      job_code: null,
      medicaid_id: "000111222",
      physical_address: "1 Hive Way, Salt Lake City, UT",
      special_directions: null,
      profile_photo_url: null,
      feature_config: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      date_of_birth: "1999-04-12",
    },
  ];

  const billing = [
    {
      client_id: CLIENT_ID,
      organization_id: TNS_ORG_ID,
      service_code: "SLH",
      authorization_pending: false,
      service_start_date: "2026-07-01",
      service_end_date: null,
    },
    {
      client_id: CLIENT_ID,
      organization_id: TNS_ORG_ID,
      service_code: "HHS",
      authorization_pending: false,
      service_start_date: "2026-07-01",
      service_end_date: null,
    },
    {
      client_id: CLIENT_ID,
      organization_id: TNS_ORG_ID,
      service_code: "DSI",
      authorization_pending: false,
      service_start_date: "2026-07-01",
      service_end_date: null,
    },
  ];

  const assignees = [
    {
      instance_id: INST_OVERDUE_ID,
      staff_id: ADMIN_USER_ID,
      staff_name: "Dana Admin",
      organization_id: TNS_ORG_ID,
    },
    {
      instance_id: INST_DUE_ID,
      staff_id: STAFF_USER_ID,
      staff_name: "Jordan Lee",
      organization_id: TNS_ORG_ID,
    },
    {
      instance_id: INST_DUE_ID,
      staff_id: DSP_USER_ID,
      staff_name: "Alex DSP",
      organization_id: TNS_ORG_ID,
    },
    {
      instance_id: INST_CONDUCT_ID,
      staff_id: STAFF_USER_ID,
      staff_name: "Jordan Lee",
      organization_id: TNS_ORG_ID,
    },
    {
      instance_id: INST_THIRTY_ID,
      staff_id: STAFF_USER_ID,
      staff_name: "Jordan Lee",
      organization_id: TNS_ORG_ID,
    },
    {
      instance_id: INST_CLIENT_ID,
      staff_id: STAFF_USER_ID,
      staff_name: "Jordan Lee",
      organization_id: TNS_ORG_ID,
    },
  ];

  const completions = [
    {
      id: "e2e00000-0000-4000-a000-000000000041",
      instance_id: INST_DONE_ID,
      staff_id: ADMIN_USER_ID,
      staff_name: "Dana Admin",
      completed_at: fx.instDone.completed_at,
      evidence_type_used: "upload",
      upload_path: null,
      upload_filename: "qm-plan.pdf",
      attestation_text_snapshot: null,
      form_submission_id: null,
      nectar_validation_status: "passed",
      nectar_validation_reasons: null,
      nectar_extracted_cert_type: null,
      nectar_extracted_expires_date: null,
    },
  ];

  return {
    organization_members: members,
    organizations: [
      {
        id: TNS_ORG_ID,
        nectar_profile_saved_at: null,
        ...ORG,
        created_at: mockWelcomeIncomplete
          ? new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
          : ORG.created_at,
        welcome_dismissed_at: null,
      },
    ],
    profiles,
    org_member_directory: directory,
    role_permissions: rolePermissions,
    user_permission_overrides: [],
    auditor_accounts: [],
    org_subscriptions: [
      {
        organization_id: TNS_ORG_ID,
        plan: "enterprise",
        status: "active",
        locked_at: null,
        created_at: new Date().toISOString(),
      },
    ],
    hive_executives: [],
    nectar_documents: [],
    policy_signatures: [],
    company_obligations: fx.obligations,
    company_obligation_instances: fx.instances,
    company_obligation_instance_assignees: assignees,
    company_obligation_completions: completions,
    clients,
    client_billing_codes: billing,
    evv_timesheets: mockWelcomeIncomplete
      ? []
      : [
          {
            id: "e2e00000-0000-4000-a000-000000000050",
            organization_id: TNS_ORG_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_USER_ID,
            attested_accurate: true,
            attested_at: "2026-08-01T18:00:00.000Z",
            shift_note_text: "Supported grocery shopping and practiced money skills.",
            status: "Completed",
          },
        ],
    daily_logs: mockWelcomeIncomplete
      ? []
      : [
          {
            id: "e2e00000-0000-4000-a000-000000000051",
            organization_id: TNS_ORG_ID,
            client_id: CLIENT_ID,
            user_id: STAFF_USER_ID,
            narrative: "Supported grocery shopping.",
            log_date: "2026-08-01",
            status: "approved",
          },
        ],
    incident_reports: [],
    forms: [],
    staff_groups: [],
    staff_group_members: [],
    staff_assignments: [],
    feature_registry: featureRegistry(),
    organization_features: FEATURE_KEYS.map((feature_key) => ({
      organization_id: TNS_ORG_ID,
      feature_key,
      enabled: true,
      updated_by: null,
      updated_at: null,
    })),
    hrc_restriction_records: [],
    emar_records: [],
    document_attestations: [],
    upi_attestations: [],
    nectar_draft_jobs: [],
    platform_states: [],
    provider_interest_outline: [
      { organization_id: TNS_ORG_ID, codes_held: ["HHS", "SLH", "SLN", "SEI", "DSI"] },
    ],
  };
}

function jsonHeaders(origin?: string | null, extra?: Record<string, string>) {
  return {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(origin),
    ...(extra ?? {}),
  };
}

function fulfillJson(route: Route, body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  const origin = route.request().headers()["origin"];
  const payload = body === undefined ? null : body;
  return route.fulfill({
    status,
    headers: jsonHeaders(origin, extraHeaders),
    body: JSON.stringify(payload),
  });
}

function decodeDevServerFnExport(urlStr: string): string | null {
  try {
    const u = new URL(urlStr);
    const marker = "/_serverFn/";
    const idx = u.pathname.indexOf(marker);
    if (idx < 0) return null;
    let id = u.pathname.slice(idx + marker.length);
    const q = id.indexOf("?");
    if (q >= 0) id = id.slice(0, q);
    id = decodeURIComponent(id).replace(/\/$/, "");
    if (!id) return null;
    const json = Buffer.from(id, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { export?: unknown };
    if (typeof parsed.export !== "string") return null;
    return parsed.export.replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

function serverFnName(url: string, postText: string): string | null {
  const fromId = decodeDevServerFnExport(url);
  const blob = `${fromId ?? ""}\n${url}\n${postText}`;
  const names = [
    "listObligationPackMatrix",
    "createObligationPack",
    "assignObligationPack",
    "addPackItem",
    "attachExistingToPack",
    "deleteCustomPack",
    "listCompanyObligations",
    "listDeadlineObligationInstances",
    "listMyObligationInstances",
    "getMyEntitlements",
    "checkHiveExecutive",
    "getMyOrgFeatures",
    "getAuditEvidenceSnapshot",
    "getOrgServiceFootprint",
    "listStaffGroups",
    "getInboxUnreadCount",
    "getPendingUpgradeRequestCount",
    "getActiveDraftJobs",
    "listMyPendingPolicies",
    "dismissAdminWelcome",
    "ensureCurrentSummaryPeriods",
    "listOpenSummaries",
    "checkAndMarkOverdue",
    "countObligationAssigneesMissingHireDate",
    "runInternalAudit",
    "listAuditableStaff",
    "listOrgAuditPackages",
    "listOrgAuditors",
    "listOrgSubjectCandidates",
    "getCompanyObligation",
    "getIncidentOpenClocks",
    "waiveInstance",
    "recordCompletion",
    "toggleObligationActive",
    "deleteCompanyObligation",
    "createCompanyObligation",
    "updateCompanyObligation",
    "logObligationEvent",
    "requestPermission",
    "requestFeatureUpgrade",
    "getPackageBuilderDetail",
  ];
  const hit = [...names].sort((a, b) => b.length - a.length).find((n) => blob.includes(n));
  return hit ?? fromId;
}

function unwrapSeroval(parsed: unknown): Record<string, unknown> {
  if (parsed == null) return {};
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      const inner = unwrapSeroval(item);
      if (Object.keys(inner).length) return inner;
    }
    return {};
  }
  if (typeof parsed === "object") {
    const rec = parsed as Record<string, unknown>;
    if (rec.data && typeof rec.data === "object" && !Array.isArray(rec.data)) {
      return rec.data as Record<string, unknown>;
    }
    return rec;
  }
  return {};
}

function parseBody(postText: string): Record<string, unknown> {
  if (!postText) return {};
  try {
    return unwrapSeroval(JSON.parse(postText) as unknown);
  } catch {
    /* ignore */
  }
  const orgMatch = postText.match(/"organizationId"\s*:\s*"([0-9a-f-]+)"/i);
  if (orgMatch) return { organizationId: orgMatch[1] };
  return {};
}

function entitlementsPayload() {
  return {
    organization_id: TNS_ORG_ID,
    tier: "enterprise",
    status: "active",
    addons: [
      "nectar_infusion",
      "internal_audit",
      "requirements_engine",
      "priority_support",
      "hive_training",
    ],
    isExecutive: false,
  };
}

function orgFeaturesPayload() {
  const registry = featureRegistry();
  return {
    organization_id: TNS_ORG_ID,
    effective: Object.fromEntries(FEATURE_KEYS.map((k) => [k, true])),
    registry,
  };
}

function buildPackMatrix(
  fx: ReturnType<typeof fixtures>,
  persona: MockPersona,
  packKey: string,
) {
  const directory = [
    { id: persona === "admin" ? ADMIN_USER_ID : DSP_USER_ID, full_name: persona === "admin" ? "Dana Admin" : "Alex DSP" },
    { id: STAFF_USER_ID, full_name: "Jordan Lee" },
  ];
  const staff = directory.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    initials: staffInitials(p.full_name),
    role: p.id === ADMIN_USER_ID ? "admin" : "employee",
  }));
  const colMap = new Map<
    string,
    { label: string; required: boolean; evidenceType: string; obligationIds: string[] }
  >();
  for (const ob of fx.obligations) {
    if (ob.active === false) continue;
    const ref = packColumnForObligation({
      id: String(ob.id),
      title: String(ob.title),
      scope: String(ob.scope ?? "org"),
      source: String(ob.source ?? "sow"),
    });
    if (!ref || ref.packKey !== packKey) continue;
    const existing = colMap.get(ref.columnKey);
    if (existing) existing.obligationIds.push(String(ob.id));
    else {
      colMap.set(ref.columnKey, {
        label: ref.label,
        required: ref.required,
        evidenceType: String(ob.evidence_type ?? "upload"),
        obligationIds: [String(ob.id)],
      });
    }
  }
  const columns = [];
  const cells = [];
  for (const [columnKey, col] of colMap) {
    let assignedCount = 0;
    let completeCount = 0;
    let redCount = 0;
    for (const person of staff) {
      const inst = fx.instances.filter(
        (i) =>
          col.obligationIds.includes(String(i.obligation_id)) &&
          i.assignee_staff_id === person.id,
      );
      const assigned = inst.length > 0;
      const open = inst.filter((i) => i.status === "pending" || i.status === "overdue");
      const completed = inst.filter((i) => i.status === "completed" || i.status === "waived");
      const complete = assigned && open.length === 0 && completed.length > 0;
      const status = packCellStatus({ assigned, complete, required: col.required });
      if (assigned) assignedCount += 1;
      if (complete) completeCount += 1;
      if (status === "incomplete") redCount += 1;
      cells.push({
        columnKey,
        staffId: person.id,
        obligationId: col.obligationIds[0] ?? null,
        instanceId: inst[0]?.id ?? null,
        assigned,
        complete,
        required: col.required,
        status,
      });
    }
    columns.push({
      columnKey,
      obligationIds: col.obligationIds,
      label: col.label,
      required: col.required,
      evidenceType: col.evidenceType,
      completeCount,
      assignedCount,
      redCount,
    });
  }
  return {
    packs: LOCKED_PACK_KEYS.map((k) => ({
      packKey: k,
      name: LOCKED_PACK_LABEL[k],
      locked: true,
      assign: { roles: [], jobCodes: [], groupIds: [], userIds: [] },
    })),
    staff,
    columns,
    cells,
    jobCodes: [{ key: "dsp", label: "DSP" }],
    existingItems: fx.obligations
      .filter((o) => o.active !== false)
      .map((o) => ({
        id: String(o.id),
        title: String(o.title),
        packKey: packColumnForObligation({
          id: String(o.id),
          title: String(o.title),
          scope: String(o.scope ?? "org"),
        })?.packKey ?? null,
      })),
  };
}

function deadlineItems(fx: ReturnType<typeof fixtures>) {
  return [
    {
      instance_id: INST_OVERDUE_ID,
      obligation_id: OB_OVERDUE_ID,
      title: fx.overdue.title,
      catalog_title: fx.overdue.title,
      period_key: "2026",
      due_at: fx.instOverdue.due_at,
      status: "overdue",
      source: "sow",
      cadence: "annually",
      due_day_config: {},
      source_policy_section: "DHHS91172",
      evidence_type: "upload",
      linked_form_id: null,
      scope: "org",
      assignee_staff_id: null,
      assignee_staff_name: null,
      client_id: null,
      client_name: null,
    },
    {
      instance_id: INST_DUE_ID,
      obligation_id: OB_DUE_ID,
      title: fx.due.title,
      catalog_title: fx.due.title,
      period_key: "2026",
      due_at: fx.instDue.due_at,
      status: "pending",
      source: "sow",
      cadence: "one_time",
      due_day_config: {},
      source_policy_section: "DHHS91172",
      evidence_type: "upload",
      linked_form_id: null,
      scope: "staff",
      assignee_staff_id: STAFF_USER_ID,
      assignee_staff_name: "Jordan Lee",
      client_id: null,
      client_name: null,
    },
  ];
}

function myInstances(persona: MockPersona, fx: ReturnType<typeof fixtures>) {
  const staffId = persona === "admin" ? ADMIN_USER_ID : DSP_USER_ID;
  const mine = fx.instances.filter((i) => {
    if (i.obligation_id === OB_DUE_ID) return true;
    if (persona === "admin" && i.obligation_id === OB_OVERDUE_ID) return true;
    return i.assignee_staff_id === staffId;
  });
  return mine.map((inst) => {
    const ob = fx.obligations.find((o) => o.id === inst.obligation_id);
    return { ...inst, obligation: ob };
  });
}

function serverFnResult(
  name: string | null,
  body: Record<string, unknown>,
  persona: MockPersona,
  fx: ReturnType<typeof fixtures>,
): unknown {
  if (name && /hasPermission|checkPermission/i.test(name)) {
    return { allowed: persona === "admin", reason: "" };
  }
  if (name && /nectar/i.test(name) && /invoke|chat|complete/i.test(name)) {
    return { error: "Nectar is not configured in this test environment." };
  }
  switch (name) {
    case "listObligationPackMatrix":
      return buildPackMatrix(fx, persona, String(body.packKey ?? "onboarding"));
    case "createObligationPack":
      return { packKey: "custom-e2e", name: String(body.name ?? "Custom") };
    case "assignObligationPack":
    case "addPackItem":
    case "attachExistingToPack":
    case "deleteCustomPack":
      return { ok: true, obligationId: OB_CONDUCT_ID };
    case "listCompanyObligations":
      return fx.obligations;
    case "listDeadlineObligationInstances":
      return deadlineItems(fx);
    case "listMyObligationInstances":
      return myInstances(persona, fx);
    case "getMyEntitlements":
      return entitlementsPayload();
    case "checkHiveExecutive":
      return { isExecutive: mockIsExecutive };
    case "getMyOrgFeatures":
      return orgFeaturesPayload();
    case "getAuditEvidenceSnapshot":
      return EMPTY_AUDIT_EVIDENCE;
    case "getOrgServiceFootprint":
      return { codes: ["DSI", "HHS", "SEI", "SLH", "SLN"], hasAbiClients: false };
    case "listStaffGroups":
      return [];
    case "getInboxUnreadCount":
    case "getPendingUpgradeRequestCount":
      return { count: 0 };
    case "getActiveDraftJobs":
      return [];
    case "listMyPendingPolicies":
      return { pending: [], gating: [] };
    case "dismissAdminWelcome":
      return { ok: true };
    case "ensureCurrentSummaryPeriods":
      return { ok: true };
    case "listOpenSummaries":
      return [];
    case "checkAndMarkOverdue":
      return { updated: 0 };
    case "countObligationAssigneesMissingHireDate":
      return { count: 0 };
    case "runInternalAudit":
      return EMPTY_AUDIT_SUMMARY;
    case "listAuditableStaff":
      return [
        {
          user_id: STAFF_USER_ID,
          full_name: "Jordan Lee",
          email: "jordan.lee@truenorth.example",
          job_title: "DSP",
          role: "employee",
        },
      ];
    case "listOrgAuditPackages":
    case "listOrgAuditors":
    case "listOrgSubjectCandidates":
      return [];
    case "getCompanyObligation": {
      const id = String(body.obligationId ?? body.obligation_id ?? "");
      return fx.obligations.find((o) => o.id === id) ?? null;
    }
    case "getIncidentOpenClocks":
      return [];
    case "waiveInstance":
    case "recordCompletion":
    case "toggleObligationActive":
    case "deleteCompanyObligation":
    case "createCompanyObligation":
    case "updateCompanyObligation":
    case "logObligationEvent":
    case "requestPermission":
    case "requestFeatureUpgrade":
      return { ok: true };
    default:
      break;
  }

  if ("activeOrganizationId" in body) return orgFeaturesPayload();
  if ("organization_id" in body && !("organizationId" in body)) return { count: 0 };
  if ("area" in body || "dateFrom" in body || "clientIds" in body) return EMPTY_AUDIT_SUMMARY;
  if ("obligationId" in body) return { count: 0 };

  // Unknown { organizationId } list-like calls: empty array is the safe default.
  if ("organizationId" in body) return [];
  // Empty-body GET-like calls: union of entitlements + executive check.
  return entitlementsPayload();
}

async function handleSupabase(route: Route, persona: MockPersona, fx: ReturnType<typeof fixtures>) {
  const req = route.request();
  const method = req.method().toUpperCase();
  const origin = req.headers()["origin"];
  const url = new URL(req.url());

  if (method === "OPTIONS") {
    return route.fulfill({ status: 204, headers: corsHeaders(origin), body: "" });
  }

  if (url.pathname.startsWith("/auth/v1/")) {
    const session = sessionRecord(persona);
    if (url.pathname.endsWith("/user") || url.pathname.endsWith("/user/")) {
      return fulfillJson(route, session.user);
    }
    if (url.pathname.includes("/token") || url.pathname.includes("/session")) {
      return fulfillJson(route, session);
    }
    if (url.pathname.includes("/logout")) {
      return route.fulfill({ status: 204, headers: corsHeaders(origin), body: "" });
    }
    return fulfillJson(route, session);
  }

  if (url.pathname.startsWith("/realtime/v1/") || url.pathname.startsWith("/storage/v1/")) {
    return route.fulfill({ status: 200, headers: corsHeaders(origin), body: "" });
  }

  if (method !== "GET" && method !== "HEAD") {
    // Never forward writes — the suite is read-only against live obligation rows.
    return fulfillJson(route, [], 201);
  }

  if (!url.pathname.startsWith("/rest/v1/")) {
    return fulfillJson(route, []);
  }

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    return fulfillJson(route, []);
  }

  const table = decodeURIComponent(url.pathname.replace("/rest/v1/", "").split("/")[0] ?? "");
  const tables = tableRows(persona, fx);
  const rows = tables[table] ?? [];
  const filters = parsePostgrestFilters(url);
  const matched = attachEmbeds(
    table,
    rows.filter((r) => rowMatches(r, filters)),
    url.searchParams.get("select") ?? "",
    tables,
  );
  const accept = (req.headers()["accept"] ?? "").toLowerCase();
  const wantObject = accept.includes("vnd.pgrst.object");
  const count = matched.length;

  if (method === "HEAD") {
    return route.fulfill({
      status: 200,
      headers: {
        ...corsHeaders(origin),
        "content-range": count ? `0-${count - 1}/${count}` : "*/0",
        "content-type": "application/json; charset=utf-8",
      },
      body: "",
    });
  }

  if (wantObject) {
    if (!matched[0]) {
      return route.fulfill({
        status: 406,
        headers: jsonHeaders(origin),
        body: JSON.stringify({
          code: "PGRST116",
          details: "The result contains 0 rows",
          hint: null,
          message: "JSON object requested, multiple (or no) rows returned",
        }),
      });
    }
    return fulfillJson(route, matched[0], 200, {
      "content-range": `0-0/${count}`,
    });
  }

  return fulfillJson(route, matched, 200, {
    "content-range": count ? `0-${count - 1}/${count}` : "*/0",
  });
}

async function handleServerFn(route: Route, persona: MockPersona, fx: ReturnType<typeof fixtures>) {
  const req = route.request();
  const method = req.method().toUpperCase();
  if (method === "OPTIONS") {
    return route.fulfill({ status: 204, headers: corsHeaders(req.headers()["origin"]), body: "" });
  }
  const postText = req.postData() ?? "";
  let queryText = "";
  try {
    queryText = decodeURIComponent(new URL(req.url()).search);
  } catch {
    /* ignore */
  }
  const blob = `${postText}\n${queryText}`;
  const name = serverFnName(req.url(), blob);
  const body = { ...parseBody(queryText), ...parseBody(postText) };
  const result = serverFnResult(name, body, persona, fx) ?? null;
  if (!name) {
    // eslint-disable-next-line no-console
    console.log(`[hive-mock] unmatched server fn ${method} ${req.url()} body=${postText.slice(0, 180)}`);
  }
  // TanStack Start's client returns application/json payloads as-is when
  // `x-tss-serialized` is absent (see serverFnFetcher getResponse).
  return fulfillJson(route, result);
}

export async function installHiveMocks(page: Page, opts: HiveMockOptions = {}) {
  const persona: MockPersona = opts.role ?? "admin";
  mockIsExecutive = opts.isExecutive ?? false;
  mockWelcomeIncomplete = opts.welcomeIncomplete ?? false;
  const fx = fixtures();
  const session = sessionRecord(persona);

  await page.addInitScript(
    ({ storageKey, sessionJson, orgId, view }) => {
      try {
        window.localStorage.setItem(storageKey, sessionJson);
        window.localStorage.setItem("hive.activeOrgId", orgId);
        window.localStorage.setItem("portal-view", view);
      } catch {
        /* ignore */
      }
    },
    {
      storageKey: AUTH_STORAGE_KEY,
      sessionJson: JSON.stringify(session),
      orgId: TNS_ORG_ID,
      view: persona === "admin" ? "admin" : "staff",
    },
  );

  page.on("pageerror", (err) => {
    // eslint-disable-next-line no-console
    console.log(`[hive-mock pageerror] ${err.message}`);
  });

  const interceptRpc = (route: Route) => {
    const url = route.request().url();
    const tsr = route.request().headers()["x-tsr-serverfn"];
    if (url.includes("supabase.co") || url.includes(SUPABASE_HOST)) {
      return handleSupabase(route, persona, fx);
    }
    if (tsr === "true" || url.includes("/_serverFn")) {
      return handleServerFn(route, persona, fx);
    }
    return route.continue();
  };

  // Header match is required: GET server fns may not include `/_serverFn/` as
  // a path segment, and page.route cannot see Node/SSR fetches. Never fulfill
  // Vite JS modules — only RPCs with the Start header, or supabase.co.
  await page.route(/supabase\.co/i, interceptRpc);
  await page.route(/_serverFn/, interceptRpc);
  await page.route("**/*", async (route) => {
    const tsr = route.request().headers()["x-tsr-serverfn"];
    const url = route.request().url();
    if (tsr === "true" || url.includes("/_serverFn") || url.includes("supabase.co")) {
      return interceptRpc(route);
    }
    return route.continue();
  });
}

export function screenshotPath(name: string): string {
  return `/opt/cursor/artifacts/screenshots/${name}.png`;
}
