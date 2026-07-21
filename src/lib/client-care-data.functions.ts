/**
 * client-care-data.functions.ts
 *
 * THE single canonical read path for a client's care information used by
 * the PCSP tab, eMAR chart, shift/clock-out flows, workspace, punch-pad,
 * and any staff-facing surface.
 *
 * Why this exists:
 *   Different screens used to each write their own query against `clients`,
 *   `client_medications`, `client_specific_trainings`, and
 *   `client_billing_codes`. That's what allowed:
 *     • PCSP tab and Profile tab disagreeing on admission_date (timezone
 *       conversion bug)
 *     • Med attestation writing to a different table than the eMAR chart
 *       reads from
 *   Every read of a client's identity/goals/meds/authorized-codes MUST go
 *   through `getClientCareData` (server) or `useClientCareData` (client),
 *   so we can never diverge again. The lint rule in eslint.config.js
 *   enforces this.
 *
 * Staff-visibility rules live in the returned `visibility` block. Screens
 * do NOT re-implement "which goal is complete enough to show" or "does
 * this goal match the shift's service code" — they read from `visibility`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { queryOptions } from "@tanstack/react-query";
import type { CSTGoal } from "./client-specific-training.functions";
import {
  type ClientVisibilityRow,
  type SectionName,
  fieldKey,
  isFieldVisible,
  isSectionVisible,
} from "./client-staff-visibility";

// ── Return types ────────────────────────────────────────────────────────────

export type CareGoal = CSTGoal & {
  /** true when the goal has both a statement AND ≥1 assigned service code. */
  is_complete: boolean;
};

export type CareIdentity = {
  id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  /** Raw YYYY-MM-DD string. Never converted through Date() — that's the bug. */
  admission_date: string | null;
  discharge_date: string | null;
  medicaid_id: string | null;
  status: string | null;
  phone_number: string | null;
  is_own_guardian: boolean | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  support_coordinator_name: string | null;
  support_coordinator_phone: string | null;
  support_coordinator_email: string | null;
  has_abi: boolean | null;
  hr_applicable: boolean | null;
  dnr_applicable: boolean | null;
  diagnoses: string[];
  primary_care_name: string | null;
  pcsp_expiration_date: string | null;
  special_directions: string | null;
};


export type CareFlags = {
  self_admin_med_support: boolean;
  self_admin_med_support_locked: boolean;
};

export type CareMedication = {
  id: string;
  medication_name: string | null;
  dosage: string | null;
  route: string | null;
  frequency: string | null;
  scheduled_time: string | null;
  prescriber: string | null;
  instructions: string | null;
  support_level: string | null;
  is_prn: boolean | null;
  prn_instructions: string | null;
  purpose: string | null;
  adverse_effects: string | null;
  choking_risk: string | null;
  is_controlled: boolean | null;
  is_active: boolean | null;
};

export type CareAuthorizedCode = {
  id: string;
  organization_id: string;
  client_id: string;
  service_code: string;
  unit_type: string;
  rate_per_unit: number;
  annual_unit_authorization: number;
  monthly_max_units: number | null;
  weekly_cap_units: number | null;
  service_start_date: string | null;
  service_end_date: string | null;
  sce: string | null;
  provider_approver_email: string | null;
  authorization_pending: boolean | null;
};

export type CustomFieldValue = {
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
} | null;

export type CustomFieldWithValue = {
  id: string;
  field_key: string;
  field_label: string;
  data_type: "text" | "number" | "boolean" | "date";
  section: SectionName;
  value: CustomFieldValue;
};

export type CareTargetBehavior = {
  id: string;
  behavior_name: string;
  description: string;
};

export type CareEmergencyContact = {
  id: string;
  name: string;
  phone: string | null;
  relationship: string | null;
};

export type ClientCareVisibility = {
  /** Goals that a staff member should see during the given shift.
   *  Rule: is_complete AND per-goal visible AND care_plan section on AND
   *  (no shiftServiceCode ? all-complete : job_codes.includes(code)). */
  goalsForStaff: CareGoal[];
  medicationsVisible: boolean;
  /** The shift's active service code echoed back, uppercased. */
  shiftServiceCode: string | null;
  /** Resolved section on/off state (defaults applied). */
  sections: Record<SectionName, boolean>;
  /** Filtered projection staff-facing surfaces should render. Admin
   *  surfaces read the raw `identity` / `goals` / `medications` /
   *  `authorized_codes` fields — this block enforces the two-level
   *  section+field visibility (identity/care_plan) and, for
   *  `authorized_codes`, staff_assignments-based visibility: a staff
   *  member sees a code iff they're assigned to work it (no separate
   *  toggle). */
  staffCare: {
    identity: CareIdentity;
    goals: CareGoal[];
    medications: CareMedication[];
    authorized_codes: CareAuthorizedCode[];
    /** Custom fields whose owning section is toggled on for staff.
     *  Custom fields have no per-field visibility switch — they inherit
     *  their section's toggle exclusively. */
    custom_fields: CustomFieldWithValue[];
    /** Always mirrors admin — no visibility gating. */
    target_behaviors: CareTargetBehavior[];
    /** Always mirrors admin — no visibility gating. */
    emergency_contacts: CareEmergencyContact[];
    /** Always mirrors admin — no visibility gating. */
    preferred_activities: string[];
  };
};

export type ClientCareData = {
  identity: CareIdentity;
  flags: CareFlags;
  /** CST (person_specific) row id — needed by admin editors that write
   *  goals back. Null when no CST row exists yet. */
  pcsp_training_id: string | null;
  goals: CareGoal[];
  medications: CareMedication[];
  authorized_codes: CareAuthorizedCode[];
  /** All custom fields (admin view). Staff view uses
   *  `visibility.staffCare.custom_fields` (filtered by section toggle). */
  custom_fields: CustomFieldWithValue[];
  target_behaviors: CareTargetBehavior[];
  emergency_contacts: CareEmergencyContact[];
  preferred_activities: string[];
  /** Raw visibility row (as stored). Admin toggle UIs read this. */
  visibilityRow: ClientVisibilityRow;
  visibility: ClientCareVisibility;
};


// ── Server function ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

export const getClientCareData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string; shiftServiceCode?: string | null }) => {
    if (!input?.clientId || typeof input.clientId !== "string") {
      throw new Error("clientId is required");
    }
    return {
      clientId: input.clientId,
      shiftServiceCode: input.shiftServiceCode ?? null,
    };
  })
  .handler(async ({ data, context }): Promise<ClientCareData> => {
    const { clientId, shiftServiceCode } = data;
    const supabase = context.supabase as any;
    const userId = context.userId as string;

    const [clientRes, cstRes, medsRes, codesRes, visRes, cfDefsRes, cfValsRes, tbRes, ecRes, myAssignRes] =
      await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, organization_id, first_name, last_name, date_of_birth, admission_date, discharge_date, medicaid_id, account_status, self_admin_med_support, self_admin_med_support_locked, preferred_activities, phone_number, is_own_guardian, guardian_name, guardian_phone, support_coordinator_name, support_coordinator_phone, support_coordinator_email, has_abi, hr_applicable, dnr_applicable, diagnoses, primary_care_name, pcsp_expiration_date, special_directions",
        )
        .eq("id", clientId)
        .maybeSingle(),

      supabase
        .from("client_specific_trainings")
        .select("id, goals")
        .eq("client_id", clientId)
        .eq("training_type", "person_specific")
        .maybeSingle(),
      supabase
        .from("client_medications")
        .select(
          "id, medication_name, dosage, route, frequency, scheduled_time, prescriber, instructions, support_level, is_prn, prn_instructions, purpose, adverse_effects, choking_risk, is_controlled, is_active",
        )
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("medication_name", { ascending: true }),
      supabase
        .from("client_billing_codes")
        .select("*")
        .eq("client_id", clientId)
        .order("service_code"),
      supabase
        .from("client_staff_visibility")
        .select("sections, fields")
        .eq("client_id", clientId)
        .maybeSingle(),
      supabase
        .from("custom_field_definitions")
        .select("id, field_key, field_label, data_type, section, organization_id")
        .eq("entity_kind", "client")
        .order("created_at", { ascending: true }),
      supabase
        .from("custom_field_values")
        .select("definition_id, value_text, value_number, value_boolean, value_date")
        .eq("entity_kind", "client")
        .eq("entity_id", clientId),
      supabase
        .from("client_target_behaviors")
        .select("id, behavior_name, description")
        .eq("client_id", clientId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("client_emergency_contacts")
        .select("id, name, phone, relationship")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true }),
      supabase
        .from("staff_assignments")
        .select("service_codes")
        .eq("client_id", clientId)
        .eq("staff_id", userId)
        .maybeSingle(),
    ]);


    if (clientRes.error) throw clientRes.error;
    if (!clientRes.data) throw new Error("Client not found");
    if (cstRes.error) throw cstRes.error;
    if (medsRes.error) throw medsRes.error;
    if (codesRes.error) throw codesRes.error;
    // visRes / cfDefsRes / cfValsRes errors are non-fatal — treat as empty


    const row = clientRes.data as Record<string, any>;
    const identity: CareIdentity = {
      id: row.id,
      organization_id: row.organization_id ?? null,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      preferred_name: null,
      date_of_birth: row.date_of_birth ?? null,
      admission_date: row.admission_date ?? null,
      discharge_date: row.discharge_date ?? null,
      medicaid_id: row.medicaid_id ?? null,
      status: row.account_status ?? null,
      phone_number: row.phone_number ?? null,
      is_own_guardian: row.is_own_guardian ?? null,
      guardian_name: row.guardian_name ?? null,
      guardian_phone: row.guardian_phone ?? null,
      support_coordinator_name: row.support_coordinator_name ?? null,
      support_coordinator_phone: row.support_coordinator_phone ?? null,
      support_coordinator_email: row.support_coordinator_email ?? null,
      has_abi: row.has_abi ?? null,
      hr_applicable: row.hr_applicable ?? null,
      dnr_applicable: row.dnr_applicable ?? null,
      diagnoses: Array.isArray(row.diagnoses)
        ? (row.diagnoses as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
        : [],
      primary_care_name: row.primary_care_name ?? null,
      pcsp_expiration_date: row.pcsp_expiration_date ?? null,
      special_directions: row.special_directions ?? null,
    };


    const flags: CareFlags = {
      self_admin_med_support: !!row.self_admin_med_support,
      self_admin_med_support_locked: !!row.self_admin_med_support_locked,
    };

    // Structured goals — enrich each with is_complete.
    const rawGoals = Array.isArray(cstRes.data?.goals) ? cstRes.data!.goals : [];
    const goals: CareGoal[] = rawGoals.map((g: any) => {
      const goalText = String(g?.goal ?? "").trim();
      const jobCodes = Array.isArray(g?.job_codes)
        ? g.job_codes.map((c: unknown) => String(c ?? "").trim()).filter(Boolean)
        : [];
      return {
        id: String(g?.id ?? crypto.randomUUID()),
        goal: goalText,
        supports: String(g?.supports ?? ""),
        details: String(g?.details ?? ""),
        job_codes: jobCodes,
        is_complete: goalText.length > 0 && jobCodes.length > 0,
      };
    });

    // Filter authorized codes to currently-open only (same rule as
    // useClientBillingCodes — no end date or end date > today).
    const today = new Date().toISOString().slice(0, 10);
    const authorized_codes: CareAuthorizedCode[] = (
      (codesRes.data ?? []) as CareAuthorizedCode[]
    ).filter((c) => !c.service_end_date || c.service_end_date > today);

    const medications = (medsRes.data ?? []) as CareMedication[];

    // ── Visibility layer — the ONE place staff-side filters live ──────────
    const visRow = (visRes?.data ?? null) as {
      sections?: Record<string, boolean> | null;
      fields?: Record<string, boolean> | null;
    } | null;
    const visibilityRow: ClientVisibilityRow = {
      sections: (visRow?.sections ?? {}) as ClientVisibilityRow["sections"],
      fields: (visRow?.fields ?? {}) as ClientVisibilityRow["fields"],
    };

    const sections = {
      identity: isSectionVisible(visibilityRow, "identity"),
      care_plan: isSectionVisible(visibilityRow, "care_plan"),
      billing: isSectionVisible(visibilityRow, "billing"),
      files: isSectionVisible(visibilityRow, "files"),
      operations: isSectionVisible(visibilityRow, "operations"),
      compliance: isSectionVisible(visibilityRow, "compliance"),
    } as Record<SectionName, boolean>;

    // Filter individual items for the staff-facing projection.
    const identityStaff: CareIdentity = sections.identity
      ? {
          ...identity,
          admission_date: isFieldVisible(visibilityRow, fieldKey("identity", "field", "admission_date")) ? identity.admission_date : null,
          medicaid_id: isFieldVisible(visibilityRow, fieldKey("identity", "field", "medicaid_id")) ? identity.medicaid_id : null,
          discharge_date: isFieldVisible(visibilityRow, fieldKey("identity", "field", "discharge_date")) ? identity.discharge_date : null,
        }
      : {
          ...identity,
          // Name/DOB always retained so staff can still identify the person.
          admission_date: null,
          discharge_date: null,
          medicaid_id: null,
          preferred_name: null,
          status: null,
        };

    // PCSP goals always mirror what admin has on file — the blanket
    // care_plan section toggle does NOT zero the list out (same rule as
    // goalsForStaff below). Per-goal visibility switches are still honored
    // so admins can hide a specific goal.
    const goalsStaffAll = goals.filter((g) =>
      isFieldVisible(visibilityRow, fieldKey("care_plan", "goal", g.id))
    );

    const medicationsStaff = sections.care_plan
      ? medications.filter((m) => isFieldVisible(visibilityRow, fieldKey("care_plan", "medication", m.id)))
      : [];

    // Authorized codes have no visibility toggle — assignment IS visibility.
    // A staff member sees a code here iff they're assigned (via
    // staff_assignments) to work that code for this client. NULL
    // service_codes on their assignment row means "all of the client's
    // authorized codes"; no row means no codes are visible to them.
    const myCodeScope = (myAssignRes?.data as { service_codes: string[] | null } | null) ?? null;
    const authorizedCodesStaff = myCodeScope === null
      ? []
      : myCodeScope.service_codes === null
        ? authorized_codes
        : authorized_codes.filter((c) => myCodeScope.service_codes!.includes(c.service_code));

    // ── Custom fields ────────────────────────────────────────────────────
    // Scope defs to the client's own org (cross-org rows would be blocked
    // by RLS anyway, but this keeps the payload tight for the common case
    // where the querier belongs to that same org).
    const orgId = identity.organization_id;
    const cfValueByDef = new Map<string, CustomFieldValue>();
    for (const v of ((cfValsRes?.data ?? []) as any[])) {
      cfValueByDef.set(v.definition_id, {
        value_text: v.value_text ?? null,
        value_number: v.value_number ?? null,
        value_boolean: v.value_boolean ?? null,
        value_date: v.value_date ?? null,
      });
    }
    const custom_fields: CustomFieldWithValue[] = ((cfDefsRes?.data ?? []) as any[])
      .filter((d) => !orgId || d.organization_id === orgId)
      .map((d) => ({
        id: String(d.id),
        field_key: String(d.field_key ?? ""),
        field_label: String(d.field_label ?? ""),
        data_type: (d.data_type ?? "text") as CustomFieldWithValue["data_type"],
        section: ((d.section ?? "identity") as SectionName),
        value: cfValueByDef.get(d.id) ?? null,
      }));
    // Custom fields inherit their section's toggle — no per-field key.
    const customFieldsStaff = custom_fields.filter((f) => sections[f.section]);

    // goalsForStaff — shift-time compliance list. Intentionally bypasses
    // the `sections.care_plan` toggle so PCSP goals tagged for the active
    // shift's service code always appear on the punch pad / clock-out
    // attestation. Per-goal field visibility switches are still honored
    // so admins can hide a specific goal.
    const codeUpper = shiftServiceCode ? shiftServiceCode.toUpperCase() : null;
    const goalsForStaff = goals
      .filter((g) => g.is_complete)
      .filter((g) => isFieldVisible(visibilityRow, fieldKey("care_plan", "goal", g.id)))
      .filter((g) => {
        if (!codeUpper) return true;
        return g.job_codes.some((c) => c.toUpperCase() === codeUpper);
      });

    const target_behaviors: CareTargetBehavior[] = ((tbRes?.data ?? []) as any[]).map((b) => ({
      id: String(b.id),
      behavior_name: String(b.behavior_name ?? ""),
      description: String(b.description ?? ""),
    }));
    const emergency_contacts: CareEmergencyContact[] = ((ecRes?.data ?? []) as any[]).map((c) => ({
      id: String(c.id),
      name: String(c.name ?? ""),
      phone: c.phone ?? null,
      relationship: c.relationship ?? null,
    }));
    const preferred_activities: string[] = Array.isArray(row.preferred_activities)
      ? (row.preferred_activities as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
      : [];

    const visibility: ClientCareVisibility = {
      goalsForStaff,
      medicationsVisible: medicationsStaff.length > 0,
      shiftServiceCode: codeUpper,
      sections,
      staffCare: {
        identity: identityStaff,
        goals: goalsStaffAll,
        medications: medicationsStaff,
        authorized_codes: authorizedCodesStaff,
        custom_fields: customFieldsStaff,
        target_behaviors,
        emergency_contacts,
        preferred_activities,
      },
    };

    const pcsp_training_id = (cstRes.data?.id as string | undefined) ?? null;
    return {
      identity,
      flags,
      pcsp_training_id,
      goals,
      medications,
      authorized_codes,
      custom_fields,
      target_behaviors,
      emergency_contacts,
      preferred_activities,
      visibilityRow,
      visibility,
    };
  });


// ── Query options helper (for loaders and hooks) ────────────────────────────

export function clientCareDataQueryOptions(
  clientId: string | null | undefined,
  shiftServiceCode?: string | null,
) {
  const code = shiftServiceCode ?? null;
  return queryOptions({
    queryKey: ["client-care-data", clientId ?? null, code],
    enabled: !!clientId,
    queryFn: () =>
      getClientCareData({
        data: { clientId: clientId as string, shiftServiceCode: code },
      }),
  });
}
