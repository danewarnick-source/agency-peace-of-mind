import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Schemas ----------
const OrgInput = z.object({ organizationId: z.string().uuid() });

// ---------- Daily Records ----------
// FIX: writes to daily_logs (unified table) instead of hhs_daily_records
// FIX: accepts signatureDataUrl so HHS hub signature is actually saved
export const saveDailyRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId:    z.string().uuid(),
      clientId:          z.string().uuid(),
      recordDate:        z.string(),
      narrative:         z.string().min(1).max(8000),
      pcspGoalsAddressed: z.array(z.string().max(500)).max(50).default([]),
      aiStatus:          z.string().nullable().optional(),
      aiFeedback:        z.string().nullable().optional(),
      signatureDataUrl:  z.string().nullable().optional(),
      backdated:         z.boolean().optional().default(false),
      originalDueDate:   z.string().nullable().optional(),
      submittedLate:     z.boolean().optional().default(false),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("daily_logs")
      .insert({
        organization_id:       data.organizationId,
        user_id:               userId,
        client_id:             data.clientId,
        log_date:              data.recordDate,
        narrative:             data.narrative,
        pcsp_goals_addressed:  data.pcspGoalsAddressed,
        signature_data_url:    data.signatureDataUrl ?? null,
        status:                "pending_approval",
        ai_compliance_status:  data.aiStatus ?? null,
        ai_compliance_feedback: data.aiFeedback ?? null,
        backdated:             data.backdated ?? false,
        original_due_date:     data.originalDueDate ?? null,
        submitted_late:        data.submittedLate ?? false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
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
      .from("daily_logs")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("log_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- eMAR ----------
export const saveEmarLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId:       z.string().uuid(),
      clientId:             z.string().uuid(),
      medicationId:         z.string().uuid().nullable().optional(),
      medicationName:       z.string().min(1).max(200),
      dosage:               z.string().max(100).nullable().optional(),
      route:                z.string().max(100).nullable().optional(),
      scheduledFor:         z.string(),
      status:               z.enum(["Passed", "Refused", "Missed", "Held"]),
      isPrn:                z.boolean().default(false),
      prnReason:            z.string().max(500).nullable().optional(),
      isControlled:         z.boolean().default(false),
      pillCountVerified:    z.boolean().nullable().optional(),
      pillCountValue:       z.number().int().nullable().optional(),
      exceptionReason:      z.string().max(2000).nullable().optional(),
      varianceNote:         z.string().max(2000).nullable().optional(),
      isMedicationError:    z.boolean().default(false),
      attestationSigned:    z.boolean().default(false),
      signatureAttestation: z.string().max(200).nullable().optional(),
      staffName:            z.string().max(200).nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Map HHS status enum → unified emar_logs status enum.
    // Held is a first-class status (clinically distinct from omitted).
    const statusMap: Record<typeof data.status, "administered" | "refused" | "missed" | "held"> = {
      Passed: "administered",
      Refused: "refused",
      Missed: "missed",
      Held: "held",
    };
    const unifiedStatus = statusMap[data.status];

    // Cross-hub dedupe: if another hub already recorded this exact dose
    // (same client + medication + scheduled_for), return that row instead of
    // inserting a duplicate.
    if (data.medicationId) {
      const { data: existing } = await supabase
        .from("emar_logs")
        .select("*")
        .eq("client_id", data.clientId)
        .eq("medication_id", data.medicationId)
        .eq("scheduled_for", data.scheduledFor)
        .maybeSingle();
      if (existing) return existing;
    }

    const { error, data: row } = await supabase
      .from("emar_logs")
      .insert({
        organization_id:       data.organizationId,
        client_id:             data.clientId,
        medication_id:         data.medicationId ?? null,
        scheduled_for:         data.scheduledFor,
        administered_at:       unifiedStatus === "administered" ? new Date().toISOString() : null,
        status:                unifiedStatus,
        is_prn:                data.isPrn,
        prn_reason:            data.prnReason ?? null,
        is_controlled:         data.isControlled,
        pill_count_verified:   data.pillCountVerified ?? null,
        pill_count_value:      data.pillCountValue ?? null,
        exception_reason:      data.exceptionReason ?? null,
        variance_note:         data.varianceNote ?? null,
        notes:                 data.varianceNote ?? null,
        is_medication_error:   data.isMedicationError,
        attestation_signed:    data.attestationSigned,
        signature_attestation: data.signatureAttestation ?? null,
        staff_id:              userId,
        staff_name:            data.staffName ?? null,
        recorded_in:           "hhs",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Attendance ----------
export const setAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId:      z.string().uuid(),
      clientId:            z.string().uuid(),
      recordDate:          z.string(),
      presenceStatus:      z.enum(["Present", "Away"]),
      awayReason:          z.string().nullable().optional(),
      awayCategory:        z.enum(["Hospitalization", "Family Leave", "Unapproved Absence"]).nullable().optional(),
      staffInitials:       z.string().max(10).nullable().optional(),
      attestationAccepted: z.boolean().default(false),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hhs_monthly_attendance" as never)
      .upsert({
        organization_id:         data.organizationId,
        client_id:               data.clientId,
        record_date:             data.recordDate,
        presence_status:         data.presenceStatus,
        away_reason:             data.awayReason ?? null,
        away_category:           data.awayCategory ?? null,
        staff_initials_signature: data.staffInitials ?? null,
        attestation_accepted:    data.attestationAccepted,
        provider_id:             userId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as never, { onConflict: "client_id,record_date" })
    if (error) throw new Error(error.message);
    return row;
  });

export const listAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId: z.string().uuid(),
      monthStart:     z.string(),
      monthEnd:       z.string(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hhs_monthly_attendance" as never)
      .select("*")
      .eq("organization_id", data.organizationId)
      .gte("record_date", data.monthStart)
      .lte("record_date", data.monthEnd);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ---------- PRN Forms ----------
export const savePrnForm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      kind:           z.string(),
      organizationId: z.string().uuid(),
      clientId:       z.string().uuid(),
      payload:        z.record(z.unknown()),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("submitted_forms" as never)
      .insert({
        organization_id: data.organizationId,
        user_id:         userId,
        client_id:       data.clientId,
        form_type:       data.kind,
        payload:         data.payload,
        occurred_at:     new Date().toISOString(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Incident Reports ----------
export const saveIncidentReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      organizationId:       z.string().uuid(),
      clientId:             z.string().uuid(),
      occurredAt:           z.string(),
      incidentAddress:      z.string().nullable().optional(),
      individualsInvolved:  z.array(z.string()).default([]),
      incidentCategories:   z.array(z.string()).default([]),
      incidentTypeOther:    z.string().nullable().optional(),
      description:          z.string().min(1),
      narrativeBefore:      z.string().nullable().optional(),
      narrativeDuring:      z.string().nullable().optional(),
      narrativeAfter:       z.string().nullable().optional(),
      guardianNotified:     z.boolean().nullable().optional(),
      guardianContactMethod: z.string().nullable().optional(),
      guardianContactAt:    z.string().nullable().optional(),
      guardianResponse:     z.string().nullable().optional(),
      protectiveActions:    z.string().nullable().optional(),
    }).parse(i)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("hhs_incident_reports" as never)
      .insert({
        organization_id:        data.organizationId,
        client_id:              data.clientId,
        reported_by:            userId,
        occurred_at:            data.occurredAt,
        incident_address:       data.incidentAddress ?? null,
        individuals_involved:   data.individualsInvolved,
        incident_categories:    data.incidentCategories,
        incident_type_other:    data.incidentTypeOther ?? null,
        description:            data.description,
        narrative_before:       data.narrativeBefore ?? null,
        narrative_during:       data.narrativeDuring ?? null,
        narrative_after:        data.narrativeAfter ?? null,
        guardian_notified:      data.guardianNotified ?? null,
        guardian_contact_method: data.guardianContactMethod ?? null,
        guardian_contact_at:    data.guardianContactAt ?? null,
        guardian_response:      data.guardianResponse ?? null,
        protective_actions:     data.protectiveActions ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Preserved listing helpers (restored to keep imports working) ----------
export const listEmarLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => OrgInput.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("emar_logs")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
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
