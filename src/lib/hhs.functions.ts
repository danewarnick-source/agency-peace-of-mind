import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Schemas ----------
const OrgInput = z.object({ organizationId: z.string().uuid() });
const ClientDateInput = z.object({
  organizationId: z.string().uuid(),
  clientId: z.string().uuid(),
  date: z.string().optional(),
});

// ---------- Daily Records ----------
export const saveDailyRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      recordDate: z.string(),
      narrative: z.string().min(1).max(8000),
      pcspGoalsAddressed: z.array(z.string().max(500)).max(50).default([]),
      aiStatus: z.string().nullable().optional(),
      aiFeedback: z.string().nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("hhs_daily_records" as never)
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        provider_id: userId,
        record_date: data.recordDate,
        narrative: data.narrative,
        pcsp_goals_addressed: data.pcspGoalsAddressed,
        ai_compliance_status: data.aiStatus ?? null,
        ai_compliance_feedback: data.aiFeedback ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listDailyRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("hhs_daily_records" as never)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("record_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- eMAR ----------
export const saveEmarLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      medicationId: z.string().uuid().nullable().optional(),
      medicationName: z.string().min(1).max(200),
      dosage: z.string().max(100).nullable().optional(),
      route: z.string().max(100).nullable().optional(),
      scheduledFor: z.string(),
      status: z.enum(["Passed", "Refused", "Missed", "Held"]),
      isPrn: z.boolean().default(false),
      prnReason: z.string().max(500).nullable().optional(),
      isControlled: z.boolean().default(false),
      pillCountVerified: z.boolean().nullable().optional(),
      pillCountValue: z.number().int().nullable().optional(),
      exceptionReason: z.string().max(2000).nullable().optional(),
      varianceNote: z.string().max(2000).nullable().optional(),
      isMedicationError: z.boolean().default(false),
      attestationSigned: z.boolean().default(false),
      signatureAttestation: z.string().max(500).nullable().optional(),
      staffName: z.string().max(200).nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.attestationSigned) throw new Error("Staff attestation checkbox is required before submitting any medication record.");
    if (data.isPrn && !data.prnReason) throw new Error("PRN reason required.");
    if (data.isControlled && data.status === "Passed" && !data.pillCountVerified) {
      throw new Error("Controlled substance requires pill count verification.");
    }
    if ((data.status !== "Passed" || data.isMedicationError) && !data.varianceNote) {
      throw new Error("Clinical Variance & Administration Exception documentation is required.");
    }
    const { error, data: row } = await supabase
      .from("hhs_emar_logs" as never)
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        provider_id: userId,
        medication_id: data.medicationId ?? null,
        medication_name: data.medicationName,
        dosage: data.dosage ?? null,
        route: data.route ?? null,
        scheduled_for: data.scheduledFor,
        administered_at: data.status === "Passed" ? new Date().toISOString() : null,
        status: data.status,
        is_prn: data.isPrn,
        prn_reason: data.prnReason ?? null,
        is_controlled: data.isControlled,
        pill_count_verified: data.pillCountVerified ?? null,
        pill_count_value: data.pillCountValue ?? null,
        exception_reason: data.exceptionReason ?? null,
        variance_note: data.varianceNote ?? null,
        is_medication_error: data.isMedicationError,
        attestation_signed: data.attestationSigned,
        signature_attestation: data.signatureAttestation ?? null,
        staff_name: data.staffName ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listEmarLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("hhs_emar_logs" as never)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- Attendance ----------
export const setAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      recordDate: z.string(),
      presenceStatus: z.enum(["Present", "Away"]),
      awayReason: z.string().max(500).nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("hhs_monthly_attendance" as never)
      .upsert(
        {
          organization_id: data.organizationId,
          client_id: data.clientId,
          provider_id: userId,
          record_date: data.recordDate,
          presence_status: data.presenceStatus,
          away_reason: data.awayReason ?? null,
        } as never,
        { onConflict: "organization_id,client_id,record_date" }
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      monthStart: z.string(),
      monthEnd: z.string(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("hhs_monthly_attendance" as never)
      .select("*")
      .eq("organization_id", data.organizationId)
      .gte("record_date", data.monthStart)
      .lte("record_date", data.monthEnd);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- PRN Forms (medical, summary, inventory, drill, transfer) ----------
export const savePrnForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      kind: z.enum(["medical", "summary", "inventory", "drill", "transfer"]),
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      payload: z.record(z.string(), z.unknown()),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const base = {
      organization_id: data.organizationId,
      client_id: data.clientId,
      provider_id: userId,
    };
    const p = data.payload as Record<string, unknown>;
    const tableMap = {
      medical: "hhs_medical_logs",
      summary: "hhs_monthly_summaries",
      inventory: "hhs_client_inventories",
      drill: "hhs_evacuation_drills",
      transfer: "hhs_transfer_logs",
    } as const;
    const table = tableMap[data.kind];
    const row = { ...base, ...p };
    const { error, data: inserted } = await supabase
      .from(table as never)
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const listPrnForms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const [med, sum, inv, dr, tr] = await Promise.all([
      sb.from("hhs_medical_logs" as never).select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false }).limit(200),
      sb.from("hhs_monthly_summaries" as never).select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false }).limit(200),
      sb.from("hhs_client_inventories" as never).select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false }).limit(200),
      sb.from("hhs_evacuation_drills" as never).select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false }).limit(200),
      sb.from("hhs_transfer_logs" as never).select("*").eq("organization_id", data.organizationId).order("created_at", { ascending: false }).limit(200),
    ]);
    return {
      medical: med.data ?? [],
      summary: sum.data ?? [],
      inventory: inv.data ?? [],
      drill: dr.data ?? [],
      transfer: tr.data ?? [],
    };
  });

// ---------- Incident Reports (Form C) ----------
export const saveIncidentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      clientId: z.string().uuid(),
      occurredAt: z.string(),
      incidentAddress: z.string().max(500).nullable().optional(),
      individualsInvolved: z.array(z.string().min(1).max(200)).max(50).default([]),
      incidentCategories: z.array(z.string().max(50)).max(20).default([]),
      incidentTypeOther: z.string().max(200).nullable().optional(),
      description: z.string().min(1).max(8000),
      narrativeBefore: z.string().max(4000).nullable().optional(),
      narrativeDuring: z.string().max(4000).nullable().optional(),
      narrativeAfter: z.string().max(4000).nullable().optional(),
      guardianNotified: z.boolean().nullable().optional(),
      guardianContactMethod: z.string().max(50).nullable().optional(),
      guardianContactAt: z.string().nullable().optional(),
      guardianResponse: z.string().max(2000).nullable().optional(),
      protectiveActions: z.string().max(4000).nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const triggers = ["Abuse", "Neglect", "Exploitation", "Maltreatment"];
    const needsProtective = data.incidentCategories.some((c) => triggers.includes(c));
    if (needsProtective && !data.protectiveActions) {
      throw new Error("Protective Actions are required when abuse/neglect/exploitation/maltreatment is reported.");
    }
    const { error, data: row } = await supabase
      .from("hhs_incident_reports" as never)
      .insert({
        organization_id: data.organizationId,
        client_id: data.clientId,
        provider_id: userId,
        occurred_at: data.occurredAt,
        incident_address: data.incidentAddress ?? null,
        individuals_involved: data.individualsInvolved,
        incident_categories: data.incidentCategories,
        incident_type_other: data.incidentTypeOther ?? null,
        description: data.description,
        narrative_before: data.narrativeBefore ?? null,
        narrative_during: data.narrativeDuring ?? null,
        narrative_after: data.narrativeAfter ?? null,
        guardian_notified: data.guardianNotified ?? null,
        guardian_contact_method: data.guardianContactMethod ?? null,
        guardian_contact_at: data.guardianContactAt ?? null,
        guardian_response: data.guardianResponse ?? null,
        protective_actions: data.protectiveActions ?? null,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("hhs_incident_reports" as never)
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const markIncidentFiled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      incidentId: z.string().uuid(),
      upiReferenceNumber: z.string().min(1).max(100),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("hhs_incident_reports" as never)
      .update({
        status: "upi_filed",
        upi_reference_number: data.upiReferenceNumber,
        upi_filed_at: new Date().toISOString(),
        upi_filed_by: userId,
      } as never)
      .eq("id", data.incidentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
