/**
 * HR per-staff checklist + PII server functions.
 *
 * PII (SSN last-4, DOB, home address, pay rates) and HR documents are gated
 * server-side via the `can_view_staff_pii(_org, _staff, _viewer)` SQL helper:
 * admin / team-manager-of-staff / self only — everyone else is denied. Staff
 * may READ their own record but may NOT edit completion status (enforced in
 * RLS + here). All HR document reads issue short-TTL signed URLs and log the
 * access event into `hr_document_access_log`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  parseCumulativeConfig,
  computeAnnualHoursProgress,
  loadOrgAnnualHoursProgress,
  type AnnualHoursProgress,
  type CumulativeRequirementConfig,
  type TrainingContribution,
  type HoursEntry,
} from "@/lib/hr-training-hours.functions";
import {
  isRequirementApplicable,
  parseAppliesTo,
} from "@/lib/staff-applicability";
import {
  BASELINE_STAFF_TRAININGS,
  baselineRequirementId,
  dueDateFor,
  isBaselineApplicable,
} from "@/lib/staff-training-requirements";



const orgStaff = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
});

const HR_BUCKET = "hr-documents";

// --- Reads -----------------------------------------------------------------

export interface StaffPii {
  staff_id: string;
  ssn_last4: string | null;
  date_of_birth: string | null;
  home_address: string | null;
  hourly_rate: number | null;
  daily_rate: number | null;
}

export const getStaffPii = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaff.parse(d))
  .handler(async ({ data, context }): Promise<StaffPii | null> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any).rpc("get_staff_pii", {
      _org: data.organization_id,
      _staff: data.staff_id,
    });
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) return null;
    return rows[0] as StaffPii;
  });

/**
 * Bulk variant: returns one row per staff in the org that the caller is
 * permitted to see (admin → all; team manager → their team; staff → self).
 * Server-side `list_staff_pii(_org)` enforces the gate row-by-row; no other
 * rows leak. Use this for the employees roster instead of selecting
 * `hourly_rate`/`daily_rate` directly from `profiles` (those columns are
 * REVOKEd from `authenticated`).
 */
export const listStaffPii = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<StaffPii[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any).rpc("list_staff_pii", {
      _org: data.organization_id,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as StaffPii[];
  });

export interface ChecklistRow {
  requirement_id: string;
  title: string;
  category: string | null;
  source_citation: string | null;
  evidence_type: string | null;
  renewal_frequency: string | null;
  checklist_layer: string | null;
  is_renewable: boolean;
  renewal_interval_months: number | null;
  renewal_source: string | null;
  completion: {
    id: string | null;
    status: string;
    completed_date: string | null;
    expires_at: string | null; // effective: stored OR computed
    evidence_document_id: string | null;
    notes: string | null;
    completed_by: string | null;
    training_completion_id: string | null;
    auto_checked_at: string | null;
    admin_signed_off_at: string | null;
    nectar_name_match: string | null;
    nectar_extracted_name: string | null;
    nectar_reviewed_at: string | null;
    nectar_validation_status: string | null;
    nectar_validation_reasons: string[] | null;
    nectar_extracted_cert_type: string | null;
    nectar_extracted_completed_date: string | null;
    nectar_extracted_summary: string | null;
  };

  applicable: boolean;
  applies_to_staff_types: string[] | "all";
  applies_to_confirmed_at: string | null;
}


export const getStaffChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaff.parse(d))
  .handler(async ({ data, context }): Promise<ChecklistRow[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // Fail-closed: if caller can't view PII for this staffer, deny everything.
    const { data: canView } = await sb.rpc("can_view_staff_pii", {
      _org: data.organization_id,
      _staff: data.staff_id,
      _viewer: userId,
    });
    if (!canView) throw new Error("Forbidden: cannot view staff HR record");

    const [
      { data: base, error: baseErr },
      { data: comp, error: compErr },
      { data: prof },
      { data: baselineComp },
      { data: behaviorClients },
      { data: assignedClientIds },
    ] = await Promise.all([
      sb.rpc("get_hr_staff_checklist_base", { _org: data.organization_id }),
      sb
        .from("staff_checklist_completion")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("staff_id", data.staff_id),
      sb
        .from("profiles")
        .select("staff_type_keys, hire_date, start_date, requires_deescalation, requires_abi")
        .eq("id", data.staff_id)
        .maybeSingle(),
      sb
        .from("staff_baseline_training_completions")
        .select("*")
        .eq("organization_id", data.organization_id)
        .eq("staff_id", data.staff_id),
      sb
        .from("behavior_support_clients")
        .select("client_id")
        .eq("organization_id", data.organization_id)
        .eq("features_enabled", true),
      sb
        .from("staff_assignments")
        .select("client_id")
        .eq("organization_id", data.organization_id)
        .eq("staff_id", data.staff_id),
    ]);
    if (baseErr) throw new Error(baseErr.message);
    if (compErr) throw new Error(compErr.message);

    const staffTypeKeys: string[] =
      (prof?.staff_type_keys as string[] | null) ?? [];
    const hireDateStr =
      (prof?.start_date as string | null) ??
      (prof?.hire_date as string | null) ??
      null;
    const hireDate = hireDateStr ? new Date(`${hireDateStr}T00:00:00Z`) : null;
    const behaviorClientIds = new Set<string>(
      (behaviorClients ?? []).map((r: { client_id: string }) => r.client_id),
    );
    const myClientIds: string[] = (assignedClientIds ?? []).map(
      (r: { client_id: string }) => r.client_id,
    );
    const hasBehaviorClient = myClientIds.some((id) =>
      behaviorClientIds.has(id),
    );
    // ABI: OR in the per-client `has_abi` flag — any assigned client with
    // ABI triggers the ABI training requirement for this staff member.
    let hasAbiClient = false;
    if (myClientIds.length > 0) {
      const { data: abiClients } = await sb
        .from("clients")
        .select("id")
        .eq("organization_id", data.organization_id)
        .in("id", myClientIds)
        .eq("has_abi", true)
        .limit(1);
      hasAbiClient = (abiClients ?? []).length > 0;
    }
    const requiresDeescalation =
      (prof?.requires_deescalation as boolean | undefined) === true ||
      hasBehaviorClient;
    const requiresAbi =
      (prof?.requires_abi as boolean | undefined) === true || hasAbiClient;

    const compMap = new Map<string, Record<string, unknown>>();
    for (const c of comp ?? []) compMap.set(c.requirement_id as string, c);

    const adminRows: ChecklistRow[] = (base ?? []).map(
      (r: Record<string, unknown>) => {
        const c = compMap.get(r.id as string);
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const isRenewable = meta.is_renewable === true;
        const intervalMonths =
          typeof meta.renewal_interval_months === "number"
            ? (meta.renewal_interval_months as number)
            : null;
        const completedDate = (c?.completed_date as string) ?? null;
        let effExpiry = (c?.expires_at as string) ?? null;
        if (!effExpiry && isRenewable && intervalMonths && completedDate) {
          const d = new Date(completedDate);
          if (!Number.isNaN(d.getTime())) {
            d.setUTCMonth(d.getUTCMonth() + intervalMonths);
            effExpiry = d.toISOString().slice(0, 10);
          }
        }
        const { applies_to, applies_to_confirmed_at } = parseAppliesTo(meta);
        const applicable = isRequirementApplicable({
          applies_to,
          applies_to_confirmed_at,
          staff_type_keys: staffTypeKeys,
        });
        return {
          requirement_id: r.id as string,
          title:
            (r.title as string) ?? (r.short_label as string) ?? "Untitled",
          category: (r.category as string) ?? null,
          source_citation: (r.source_citation as string) ?? null,
          evidence_type: (r.evidence_type as string) ?? null,
          renewal_frequency: (r.renewal_frequency as string) ?? null,
          checklist_layer: (meta.checklist_layer as string) ?? null,
          is_renewable: isRenewable,
          renewal_interval_months: intervalMonths,
          renewal_source: (meta.renewal_source as string) ?? null,
          completion: {
            id: (c?.id as string) ?? null,
            status: (c?.status as string) ?? "not_started",
            completed_date: completedDate,
            expires_at: effExpiry,
            evidence_document_id:
              (c?.evidence_document_id as string) ?? null,
            notes: (c?.notes as string) ?? null,
            completed_by: (c?.completed_by as string) ?? null,
            training_completion_id:
              (c?.training_completion_id as string) ?? null,
            auto_checked_at: (c?.auto_checked_at as string) ?? null,
            admin_signed_off_at: null,
            nectar_name_match: null,
            nectar_extracted_name: null,
            nectar_reviewed_at: null,
            nectar_validation_status: null,
            nectar_validation_reasons: null,
            nectar_extracted_cert_type: null,
            nectar_extracted_completed_date: null,
            nectar_extracted_summary: null,
          },

          applicable,
          applies_to_staff_types:
            applies_to === null || applies_to === undefined ? "all" : applies_to,
          applies_to_confirmed_at,
        };
      },
    );

    // Baseline rows — synthesized for EVERY employee so a new hire with
    // nothing on file shows Overdue / To-Do (never the silent "0 overdue").
    const adminTitleSet = new Set(
      adminRows.map((r) => r.title.trim().toLowerCase()),
    );
    const baselineMap = new Map<string, Record<string, unknown>>();
    for (const bc of baselineComp ?? [])
      baselineMap.set(bc.training_key as string, bc);

    const baselineRows: ChecklistRow[] = BASELINE_STAFF_TRAININGS.map((t) => {
      const applicable = isBaselineApplicable(t, {
        hireDate,
        requiresDeescalation,
        requiresAbi,
      });
      const bc = baselineMap.get(t.key);
      const completedDate = (bc?.completed_date as string | null) ?? null;
      const expiresAt = (bc?.expires_at as string | null) ?? null;
      const evidenceDocId =
        (bc?.evidence_document_id as string | null) ?? null;
      const adminSignedOffAt =
        (bc?.admin_signed_off_at as string | null) ?? null;
      const nectarNameMatch =
        (bc?.nectar_name_match as string | null) ?? null;
      const nectarExtractedName =
        (bc?.nectar_extracted_name as string | null) ?? null;
      const nectarReviewedAt =
        (bc?.nectar_reviewed_at as string | null) ?? null;
      // Status:
      //   complete   = admin signed off AND not expired
      //   expired    = past expiration OR (no completion and past due date)
      //   in_progress= certificate uploaded, awaiting admin sign-off
      //   not_started= nothing on file
      const todayMs = Date.now();
      const expMs = expiresAt
        ? new Date(`${expiresAt}T00:00:00Z`).getTime()
        : null;
      let status: string = "not_started";
      if (adminSignedOffAt) {
        status = expMs !== null && expMs < todayMs ? "expired" : "complete";
      } else if (evidenceDocId) {
        status = "in_progress";
      } else {
        const due = dueDateFor(t, hireDate);
        if (due && new Date(`${due}T00:00:00Z`).getTime() < todayMs) {
          status = "expired"; // UI renders as Overdue
        } else {
          status = "not_started"; // UI renders as Incomplete
        }
      }
      return {
        requirement_id: baselineRequirementId(t.key),
        title: t.title,
        category: t.category,
        source_citation: t.hint ?? null,
        evidence_type: t.tracks_expiration ? "certificate" : "completion",
        renewal_frequency: null,
        checklist_layer: "Baseline",
        is_renewable: t.tracks_expiration,
        renewal_interval_months: t.default_validity_months,
        renewal_source: null,
        completion: {
          id: (bc?.id as string | null) ?? null,
          status,
          completed_date: completedDate,
          expires_at: expiresAt,
          evidence_document_id: evidenceDocId,
          notes: (bc?.notes as string | null) ?? null,
          completed_by: (bc?.completed_by as string | null) ?? null,
          training_completion_id: null,
          auto_checked_at: null,
          admin_signed_off_at: adminSignedOffAt,
          nectar_name_match: nectarNameMatch,
          nectar_extracted_name: nectarExtractedName,
          nectar_reviewed_at: nectarReviewedAt,
          nectar_validation_status:
            (bc?.nectar_validation_status as string | null) ?? null,
          nectar_validation_reasons:
            (bc?.nectar_validation_reasons as string[] | null) ?? null,
          nectar_extracted_cert_type:
            (bc?.nectar_extracted_cert_type as string | null) ?? null,
          nectar_extracted_completed_date:
            (bc?.nectar_extracted_completed_date as string | null) ?? null,
          nectar_extracted_summary:
            (bc?.nectar_extracted_summary as string | null) ?? null,
        },
        applicable,
        applies_to_staff_types: "all" as const,
        applies_to_confirmed_at: null,

      };

    }).filter(
      // Don't double-list a baseline if the admin already created an
      // equivalent custom requirement with the same title.
      (r) => !adminTitleSet.has(r.title.trim().toLowerCase()),
    );

    return [...baselineRows, ...adminRows];
  });




// --- Mutations -------------------------------------------------------------

export const upsertChecklistCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        requirement_id: z.string().uuid(),
        status: z.enum([
          "not_started",
          "in_progress",
          "complete",
          "expired",
          "waived",
        ]),
        completed_date: z.string().date().nullable().optional(),
        expires_at: z.string().date().nullable().optional(),
        evidence_document_id: z.string().uuid().nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    if (userId === data.staff_id) {
      throw new Error("Forbidden: staff may not edit own completion");
    }
    // Admin edits the GENERAL (per-staff, no-client) completion row. Two partial
    // unique indexes now sit on this table: scc_unique_general WHERE client_id
    // IS NULL, and scc_unique_per_client WHERE client_id IS NOT NULL. PostgREST
    // .upsert(onConflict) can't name a partial-index predicate, so do a
    // select-by-(org, staff, requirement, client_id IS NULL) then insert-or-
    // update-by-id. Behavior is identical to the previous upsert.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: existing, error: selErr } = await sb
      .from("staff_checklist_completion")
      .select("id")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .eq("requirement_id", data.requirement_id)
      .is("client_id", null)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    const payload = {
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      requirement_id: data.requirement_id,
      client_id: null as string | null,
      status: data.status,
      completed_date: data.completed_date ?? null,
      expires_at: data.expires_at ?? null,
      evidence_document_id: data.evidence_document_id ?? null,
      notes: data.notes ?? null,
      completed_by: userId,
    };

    const { error } = existing?.id
      ? await sb
          .from("staff_checklist_completion")
          .update(payload)
          .eq("id", existing.id)
      : await sb.from("staff_checklist_completion").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


const piiUpdateSchema = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
  ssn_last4: z
    .string()
    .regex(/^[0-9]{4}$/, "Must be exactly 4 digits")
    .nullable()
    .optional(),
  date_of_birth: z.string().date().nullable().optional(),
  home_address: z.string().max(500).nullable().optional(),
  hourly_rate: z.number().min(0).max(99999).nullable().optional(),
  daily_rate: z.number().min(0).max(99999).nullable().optional(),
});

export const updateStaffPii = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => piiUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: canView } = await sb.rpc("can_view_staff_pii", {
      _org: data.organization_id,
      _staff: data.staff_id,
      _viewer: userId,
    });
    if (!canView) throw new Error("Forbidden");
    // Self may read own PII; only Admin/Manager may edit (including their own,
    // so a solo owner-operator isn't locked out).
    if (userId === data.staff_id) {
      const { data: mem } = await sb
        .from("organization_members")
        .select("role")
        .eq("organization_id", data.organization_id)
        .eq("user_id", userId)
        .eq("active", true)
        .maybeSingle();
      const role = (mem as { role?: string } | null)?.role;
      if (role !== "admin" && role !== "manager") {
        throw new Error("Forbidden: staff may not edit own PII");
      }
    }


    const patch: Record<string, unknown> = {};
    if (data.ssn_last4 !== undefined) patch.ssn_last4 = data.ssn_last4;
    if (data.date_of_birth !== undefined) patch.date_of_birth = data.date_of_birth;
    if (data.home_address !== undefined) patch.home_address = data.home_address;
    if (data.hourly_rate !== undefined) patch.hourly_rate = data.hourly_rate;
    if (data.daily_rate !== undefined) patch.daily_rate = data.daily_rate;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await sb.from("profiles").update(patch).eq("id", data.staff_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- HR document storage (signed URLs + access log) ------------------------

export interface HrDocument {
  id: string;
  document_kind: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  requirement_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export const listHrDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaff.parse(d))
  .handler(async ({ data, context }): Promise<HrDocument[]> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("hr_documents")
      .select("id, document_kind, file_name, mime_type, size_bytes, requirement_id, uploaded_by, created_at")
      .eq("organization_id", data.organization_id)
      .eq("staff_id", data.staff_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as HrDocument[];
  });

export const createHrDocumentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        staff_id: z.string().uuid(),
        requirement_id: z.string().uuid().nullable().optional(),
        document_kind: z.string().min(1).max(64),
        file_name: z.string().min(1).max(255),
        mime_type: z.string().max(255).optional(),
        size_bytes: z.number().int().min(0).max(50 * 1024 * 1024).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: canView } = await sb.rpc("can_view_staff_pii", {
      _org: data.organization_id,
      _staff: data.staff_id,
      _viewer: userId,
    });
    if (!canView) throw new Error("Forbidden");

    const safeName = data.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${data.organization_id}/${data.staff_id}/${crypto.randomUUID()}-${safeName}`;

    const { data: signed, error: signErr } = await sb.storage
      .from(HR_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (signErr) throw new Error(signErr.message);

    // Pre-create the row so we have an id; finalize() patches metadata.
    const { data: doc, error: insErr } = await sb
      .from("hr_documents")
      .insert({
        organization_id: data.organization_id,
        staff_id: data.staff_id,
        requirement_id: data.requirement_id ?? null,
        document_kind: data.document_kind,
        object_path: objectPath,
        file_name: data.file_name,
        mime_type: data.mime_type ?? null,
        size_bytes: data.size_bytes ?? null,
        uploaded_by: userId,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);

    await sb.from("hr_document_access_log").insert({
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      hr_document_id: doc.id,
      viewer_id: userId,
      action: "upload",
      object_path: objectPath,
    });

    return {
      hr_document_id: doc.id as string,
      object_path: objectPath,
      upload: {
        signed_url: signed.signedUrl as string,
        token: signed.token as string,
        path: signed.path as string,
      },
    };
  });

export const getHrDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        hr_document_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: doc, error: docErr } = await sb
      .from("hr_documents")
      .select("id, organization_id, staff_id, object_path, file_name")
      .eq("id", data.hr_document_id)
      .single();
    if (docErr || !doc) throw new Error("Document not found");

    const { data: canView } = await sb.rpc("can_view_staff_pii", {
      _org: doc.organization_id,
      _staff: doc.staff_id,
      _viewer: userId,
    });
    if (!canView) throw new Error("Forbidden");

    const { data: signed, error: sErr } = await sb.storage
      .from(HR_BUCKET)
      .createSignedUrl(doc.object_path, 120);
    if (sErr) throw new Error(sErr.message);

    await sb.from("hr_document_access_log").insert({
      organization_id: doc.organization_id,
      staff_id: doc.staff_id,
      hr_document_id: doc.id,
      viewer_id: userId,
      action: "view_url_issued",
      object_path: doc.object_path,
    });

    return {
      signed_url: signed.signedUrl as string,
      file_name: doc.file_name as string,
      expires_in_seconds: 120,
    };
  });

export const deleteHrDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        organization_id: z.string().uuid(),
        hr_document_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: doc, error: docErr } = await sb
      .from("hr_documents")
      .select("id, organization_id, staff_id, object_path")
      .eq("id", data.hr_document_id)
      .single();
    if (docErr || !doc) throw new Error("Document not found");
    if (userId === doc.staff_id) {
      throw new Error("Forbidden: staff may not delete own HR documents");
    }
    const { data: canView } = await sb.rpc("can_view_staff_pii", {
      _org: doc.organization_id,
      _staff: doc.staff_id,
      _viewer: userId,
    });
    if (!canView) throw new Error("Forbidden");

    await sb.storage.from(HR_BUCKET).remove([doc.object_path]);
    await sb.from("hr_documents").delete().eq("id", doc.id);
    await sb.from("hr_document_access_log").insert({
      organization_id: doc.organization_id,
      staff_id: doc.staff_id,
      hr_document_id: null,
      viewer_id: userId,
      action: "delete",
      object_path: doc.object_path,
    });
    return { ok: true };
  });

// --- HR Admin org-wide roll-up --------------------------------------------
//
// Aggregate read for the HR Admin tab. The PII gate is applied at the
// AGGREGATE level: `list_staff_pii(_org)` already returns only the staff the
// caller may view (admin → all; team manager → own team; self → self).
// We compose per-staff rollup stats from the resulting set ONLY — no fan-out
// over staff the caller can't see. Capability-only framing: counts + due
// dates + completion %. No advice copy.

export interface HrRollupRow {
  staff_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  hire_date: string | null;
  total_required: number;
  complete_count: number;
  completion_pct: number;
  open_gaps: number;
  expired_count: number;
  next_renewal: { requirement_id: string; title: string; due_date: string } | null;
  is_new_hire: boolean;
}

export interface HrRollupSummary {
  staff_count: number;
  total_open_gaps: number;
  upcoming_renewals_30d: number;
  overdue_renewals: number;
  onboarding_in_progress: number;
}

export interface HrRollup {
  summary: HrRollupSummary;
  rows: HrRollupRow[];
}

export const getHrAdminRollup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<HrRollup> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    // 1. Gated staff set — fail-closed; do not fall back to all-org.
    const { data: piiRows, error: piiErr } = await sb.rpc("list_staff_pii", {
      _org: data.organization_id,
    });
    if (piiErr) throw new Error(piiErr.message);
    const staffIds: string[] = (piiRows ?? []).map(
      (r: { staff_id: string }) => r.staff_id,
    );
    if (staffIds.length === 0) {
      return {
        summary: {
          staff_count: 0,
          total_open_gaps: 0,
          upcoming_renewals_30d: 0,
          overdue_renewals: 0,
          onboarding_in_progress: 0,
        },
        rows: [],
      };
    }

    // 2. Live base checklist (state_base + company_custom, provider_confirmed).
    const { data: base, error: baseErr } = await sb.rpc(
      "get_hr_staff_checklist_base",
      { _org: data.organization_id },
    );
    if (baseErr) throw new Error(baseErr.message);
    const baseItems: Array<{
      id: string;
      title: string;
      is_renewable: boolean;
      interval_months: number | null;
      is_cumulative: boolean;
      applies_to: string[] | "all";
      applies_to_confirmed_at: string | null;
    }> = (base ?? []).map((r: Record<string, unknown>) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const { applies_to, applies_to_confirmed_at } = parseAppliesTo(meta);
      return {
        id: r.id as string,
        title:
          (r.title as string) ?? (r.short_label as string) ?? "Untitled",
        is_renewable: meta.is_renewable === true,
        interval_months:
          typeof meta.renewal_interval_months === "number"
            ? (meta.renewal_interval_months as number)
            : null,
        is_cumulative: meta.requirement_type === "cumulative_hours",
        applies_to:
          applies_to === null || applies_to === undefined ? "all" : applies_to,
        applies_to_confirmed_at,
      };
    });
    const binaryItems = baseItems.filter((b) => !b.is_cumulative);
    const cumulativeItems = baseItems.filter((b) => b.is_cumulative);
    const baseIds = new Set(baseItems.map((b) => b.id));
    const baseById = new Map(baseItems.map((b) => [b.id, b]));
    const titleById = new Map(baseItems.map((b) => [b.id, b.title]));

    // 3. Names / team / hire_date / staff_type_keys (non-PII) for the gated staff set.
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name, team_id, hire_date, staff_type_keys")
      .in("id", staffIds);
    const profMap = new Map<
      string,
      {
        full_name: string | null;
        team_id: string | null;
        hire_date: string | null;
        staff_type_keys: string[];
      }
    >();
    for (const p of profs ?? []) {
      profMap.set(p.id, {
        full_name: p.full_name,
        team_id: p.team_id,
        hire_date: p.hire_date,
        staff_type_keys: (p.staff_type_keys as string[] | null) ?? [],
      });
    }
    const teamIds = Array.from(
      new Set(
        (profs ?? [])
          .map((p: { team_id: string | null }) => p.team_id)
          .filter((x: string | null): x is string => !!x),
      ),
    );
    const teamMap = new Map<string, string>();
    if (teamIds.length > 0) {
      const { data: teams } = await sb
        .from("teams")
        .select("id, team_name")
        .in("id", teamIds);
      for (const t of teams ?? []) teamMap.set(t.id, t.team_name);
    }

    // 4. Completions for those staff only. Effective expiry = stored
    //    expires_at OR (completed_date + renewal_interval_months) when the
    //    item is renewable. Same computation as the matrix and card view.
    const { data: comps } = await sb
      .from("staff_checklist_completion")
      .select("staff_id, requirement_id, status, completed_date, expires_at")
      .eq("organization_id", data.organization_id)
      .in("staff_id", staffIds);
    const compByStaff = new Map<
      string,
      Map<string, { status: string; expires_at: string | null }>
    >();
    for (const c of comps ?? []) {
      if (!baseIds.has(c.requirement_id)) continue;
      const b = baseById.get(c.requirement_id);
      let effExpiry: string | null = c.expires_at ?? null;
      if (
        !effExpiry &&
        b?.is_renewable &&
        b.interval_months &&
        c.completed_date
      ) {
        const d = new Date(c.completed_date);
        if (!Number.isNaN(d.getTime())) {
          d.setUTCMonth(d.getUTCMonth() + b.interval_months);
          effExpiry = d.toISOString().slice(0, 10);
        }
      }
      if (!compByStaff.has(c.staff_id)) compByStaff.set(c.staff_id, new Map());
      compByStaff
        .get(c.staff_id)!
        .set(c.requirement_id, { status: c.status, expires_at: effExpiry });
    }

    const todayMs = Date.now();
    const in30Ms = todayMs + 30 * 86400_000;
    const newHireCutoffMs = todayMs - 60 * 86400_000;

    // Cumulative-hours: load shared computation so the rollup's gap math uses
    // the SAME status the matrix cell and staff HR tab show.
    let cumProgress: Record<string, Record<string, AnnualHoursProgress>> = {};
    if (cumulativeItems.length > 0) {
      const loaded = await loadOrgAnnualHoursProgress(
        sb,
        data.organization_id,
        staffIds,
      );
      cumProgress = loaded.progress;
    }

    const rows: HrRollupRow[] = staffIds.map((sid) => {
      const p = profMap.get(sid);
      const staffTypeKeys = p?.staff_type_keys ?? [];
      const cmap = compByStaff.get(sid) ?? new Map();
      // Filter to applicable-only per staffer (single source of truth).
      const applicableBinary = binaryItems.filter((b) =>
        isRequirementApplicable({
          applies_to: b.applies_to,
          applies_to_confirmed_at: b.applies_to_confirmed_at,
          staff_type_keys: staffTypeKeys,
        }),
      );
      const applicableCumulative = cumulativeItems.filter((b) =>
        isRequirementApplicable({
          applies_to: b.applies_to,
          applies_to_confirmed_at: b.applies_to_confirmed_at,
          staff_type_keys: staffTypeKeys,
        }),
      );
      const totalRequired = applicableBinary.length + applicableCumulative.length;
      let binaryComplete = 0;
      let expired = 0;
      let nextRenewal: HrRollupRow["next_renewal"] = null;
      let nextRenewalTs = Infinity;
      for (const b of applicableBinary) {
        const c = cmap.get(b.id);
        if (c?.status === "complete") binaryComplete++;
        if (c?.status === "expired") expired++;
        if (c?.expires_at) {
          const ts = new Date(c.expires_at).getTime();
          if (!Number.isNaN(ts) && ts < nextRenewalTs) {
            nextRenewalTs = ts;
            nextRenewal = {
              requirement_id: b.id,
              title: titleById.get(b.id) ?? b.title,
              due_date: c.expires_at,
            };
          }
        }
      }
      // Cumulative: gap ONLY when enforced AND behind. Pre-tenure/on_target =
      // not a gap. Complete counts toward complete_count.
      let cumComplete = 0;
      let cumGaps = 0;
      const cumForStaff = cumProgress[sid] ?? {};
      for (const ci of applicableCumulative) {
        const prog = cumForStaff[ci.id];
        if (!prog) continue;
        if (prog.status === "complete") cumComplete++;
        else if (prog.enforced && prog.status === "behind") cumGaps++;
      }
      const complete = binaryComplete + cumComplete;
      const binaryGaps = Math.max(0, applicableBinary.length - binaryComplete);
      const openGaps = binaryGaps + cumGaps;
      const hire = p?.hire_date ?? null;
      const hireMs = hire ? new Date(hire).getTime() : null;
      const isNewHire =
        hireMs !== null && hireMs >= newHireCutoffMs && openGaps > 0;
      return {
        staff_id: sid,
        full_name: p?.full_name ?? "—",
        team_id: p?.team_id ?? null,
        team_name: p?.team_id ? (teamMap.get(p.team_id) ?? null) : null,
        hire_date: hire,
        total_required: totalRequired,
        complete_count: complete,
        completion_pct: totalRequired
          ? Math.round((complete / totalRequired) * 100)
          : 100,
        open_gaps: openGaps,
        expired_count: expired,
        next_renewal: nextRenewal,
        is_new_hire: isNewHire,
      };
    });

    const summary: HrRollupSummary = {
      staff_count: rows.length,
      total_open_gaps: rows.reduce((a, r) => a + r.open_gaps, 0),
      upcoming_renewals_30d: rows.filter(
        (r) =>
          r.next_renewal &&
          new Date(r.next_renewal.due_date).getTime() <= in30Ms &&
          new Date(r.next_renewal.due_date).getTime() >= todayMs,
      ).length,
      overdue_renewals: rows.filter(
        (r) =>
          r.next_renewal &&
          new Date(r.next_renewal.due_date).getTime() < todayMs,
      ).length,
      onboarding_in_progress: rows.filter((r) => r.is_new_hire).length,
    };

    return { summary, rows };
  });

// --- HR Compliance Matrix (org-wide grid) ---------------------------------
//
// Cross-staff "spreadsheet" view backing the HR Admin matrix. Reads the SAME
// data as the staff HR card view (base checklist + completions + computed
// expiry from completed_date + metadata.renewal_interval_months). The PII
// gate is applied at the AGGREGATE level via list_staff_pii; the matrix
// only includes staff the caller is permitted to see (admin → all;
// manager → own team; staff → self).

export interface HrMatrixRequirement {
  requirement_id: string;
  title: string;
  category: string | null;
  source_citation: string | null;
  checklist_layer: string | null;
  is_renewable: boolean;
  renewal_interval_months: number | null;
  renewal_source: string | null;
  requirement_type: "binary" | "cumulative_hours";
  cumulative_config: CumulativeRequirementConfig | null;
  applies_to_staff_types: string[] | "all";
  applies_to_confirmed_at: string | null;
  phase: string | null;
}


export interface HrMatrixCell {
  status: string; // not_started | in_progress | complete | expired | waived
  completed_date: string | null;
  expires_at: string | null; // effective: stored expires_at OR computed
  evidence_document_id: string | null;
  training_completion_id: string | null;
  auto_checked_at: string | null;
  cumulative_progress?: AnnualHoursProgress | null;
  applicable: boolean;
}

export interface HrMatrixStaff {
  staff_id: string;
  full_name: string;
  team_id: string | null;
  team_name: string | null;
  manager_id: string | null;
  manager_name: string | null;
  staff_type_keys: string[];
  cells: Record<string, HrMatrixCell>;
}

export interface HrMatrix {
  requirements: HrMatrixRequirement[];
  staff: HrMatrixStaff[];
}

function addMonthsIso(dateStr: string, months: number): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const getHrComplianceMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<HrMatrix> => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: piiRows, error: piiErr } = await sb.rpc("list_staff_pii", {
      _org: data.organization_id,
    });
    if (piiErr) throw new Error(piiErr.message);
    const staffIds: string[] = (piiRows ?? []).map(
      (r: { staff_id: string }) => r.staff_id,
    );
    if (staffIds.length === 0) {
      return { requirements: [], staff: [] };
    }

    const [{ data: base, error: baseErr }, { data: profs }, { data: comps }, { data: hoursEntries }, { data: completions }, { data: mappings }, { data: topics }] =
      await Promise.all([
        sb.rpc("get_hr_staff_checklist_base", { _org: data.organization_id }),
        sb
          .from("profiles")
          .select("id, full_name, team_id, hire_date, staff_type_keys")
          .in("id", staffIds),
        sb
          .from("staff_checklist_completion")
          .select(
            "staff_id, requirement_id, status, completed_date, expires_at, evidence_document_id, training_completion_id, auto_checked_at",
          )
          .eq("organization_id", data.organization_id)
          .in("staff_id", staffIds),
        sb
          .from("staff_training_hours_entries")
          .select("staff_id, requirement_id, entry_date, hours")
          .eq("organization_id", data.organization_id)
          .in("staff_id", staffIds),
        sb
          .from("training_completions")
          .select("id, user_id, ref_id, topic_kind, topic_title, completed_at, is_current")
          .in("user_id", staffIds)
          .eq("topic_kind", "core")
          .eq("is_current", true),
        sb
          .from("training_checklist_mappings")
          .select("training_topic_id, requirement_key, is_active")
          .eq("is_active", true),
        sb.from("training_topics").select("id, title, default_hours"),
      ]);
    if (baseErr) throw new Error(baseErr.message);

    const baseRows = (base ?? []) as Array<Record<string, unknown>>;
    const cumulativeConfigByReqId = new Map<string, CumulativeRequirementConfig>();
    const cumulativeReqKeyToId = new Map<string, string>();
    const requirements: HrMatrixRequirement[] = baseRows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const cumCfg = parseCumulativeConfig(r);
      if (cumCfg) {
        cumulativeConfigByReqId.set(cumCfg.requirement_id, cumCfg);
        cumulativeReqKeyToId.set(cumCfg.requirement_key, cumCfg.requirement_id);
      }
      const { applies_to, applies_to_confirmed_at } = parseAppliesTo(meta);
      return {
        requirement_id: r.id as string,
        title:
          (r.title as string) ?? (r.short_label as string) ?? "Untitled",
        category: (r.category as string) ?? null,
        source_citation: (r.source_citation as string) ?? null,
        checklist_layer: (meta.checklist_layer as string) ?? null,
        is_renewable: meta.is_renewable === true,
        renewal_interval_months:
          typeof meta.renewal_interval_months === "number"
            ? (meta.renewal_interval_months as number)
            : null,
        renewal_source: (meta.renewal_source as string) ?? null,
        requirement_type: cumCfg ? "cumulative_hours" : "binary",
        cumulative_config: cumCfg,
        applies_to_staff_types:
          applies_to === null || applies_to === undefined ? "all" : applies_to,
        applies_to_confirmed_at,
      };
    });
    const reqById = new Map(requirements.map((r) => [r.requirement_id, r]));

    // Teams + managers
    const teamIds = Array.from(
      new Set(
        (profs ?? [])
          .map((p: { team_id: string | null }) => p.team_id)
          .filter((x: string | null): x is string => !!x),
      ),
    );
    const teamMap = new Map<
      string,
      { name: string; manager_id: string | null }
    >();
    if (teamIds.length > 0) {
      const { data: teams } = await sb
        .from("teams")
        .select("id, team_name, manager_id")
        .in("id", teamIds);
      for (const t of teams ?? [])
        teamMap.set(t.id, { name: t.team_name, manager_id: t.manager_id });
    }
    const managerIds = Array.from(
      new Set(
        Array.from(teamMap.values())
          .map((t) => t.manager_id)
          .filter((x): x is string => !!x),
      ),
    );
    const managerNames = new Map<string, string>();
    if (managerIds.length > 0) {
      const { data: mgrs } = await sb
        .from("profiles")
        .select("id, full_name")
        .in("id", managerIds);
      for (const m of mgrs ?? [])
        managerNames.set(m.id, m.full_name ?? "—");
    }

    // Build training-hour contributions per staff × cumulative-requirement.
    const topicById = new Map<string, { title: string; default_hours: number | null }>();
    for (const t of topics ?? [])
      topicById.set(t.id, { title: t.title, default_hours: t.default_hours });
    const topicToReqId = new Map<string, string>();
    for (const m of mappings ?? []) {
      const rid = cumulativeReqKeyToId.get(m.requirement_key);
      if (rid) topicToReqId.set(m.training_topic_id, rid);
    }
    const contribKey = (s: string, r: string) => `${s}::${r}`;
    const contribMap = new Map<string, TrainingContribution[]>();
    for (const tc of completions ?? []) {
      const reqId = topicToReqId.get(tc.ref_id);
      if (!reqId) continue;
      const topic = topicById.get(tc.ref_id);
      const rawHours =
        topic?.default_hours != null ? Number(topic.default_hours) : null;
      const hours = rawHours && rawHours > 0 ? rawHours : 1.0;
      const k = contribKey(tc.user_id, reqId);
      if (!contribMap.has(k)) contribMap.set(k, []);
      contribMap.get(k)!.push({
        training_completion_id: tc.id,
        topic_id: tc.ref_id,
        topic_title: tc.topic_title ?? topic?.title ?? "Training",
        completed_at: tc.completed_at,
        hours,
        hours_source: rawHours ? "topic_default" : "fallback_one_hour",
      });
    }
    const entryMap = new Map<string, HoursEntry[]>();
    const singleCumReqId =
      cumulativeConfigByReqId.size === 1
        ? Array.from(cumulativeConfigByReqId.keys())[0]
        : null;
    for (const e of hoursEntries ?? []) {
      const reqId = e.requirement_id ?? singleCumReqId;
      if (!reqId) continue;
      const k = contribKey(e.staff_id, reqId);
      if (!entryMap.has(k)) entryMap.set(k, []);
      entryMap.get(k)!.push({
        id: "_",
        entry_date: e.entry_date,
        hours: Number(e.hours),
        note: null,
        created_by: null,
        created_by_name: null,
        created_at: "",
      });
    }

    // Group completions per staff
    const compByStaff = new Map<
      string,
      Map<string, HrMatrixCell>
    >();
    for (const c of comps ?? []) {
      const req = reqById.get(c.requirement_id);
      if (!req) continue;
      let effExpiry: string | null = c.expires_at ?? null;
      if (
        !effExpiry &&
        req.is_renewable &&
        req.renewal_interval_months &&
        c.completed_date
      ) {
        effExpiry = addMonthsIso(c.completed_date, req.renewal_interval_months);
      }
      if (!compByStaff.has(c.staff_id))
        compByStaff.set(c.staff_id, new Map());
      compByStaff.get(c.staff_id)!.set(c.requirement_id, {
        status: c.status,
        completed_date: c.completed_date ?? null,
        expires_at: effExpiry,
        evidence_document_id: c.evidence_document_id ?? null,
        training_completion_id: c.training_completion_id ?? null,
        auto_checked_at: c.auto_checked_at ?? null,
        applicable: true,
      });
    }

    const mProfMap = new Map<
      string,
      {
        id: string;
        full_name: string | null;
        team_id: string | null;
        hire_date: string | null;
        staff_type_keys: string[] | null;
      }
    >();
    for (const p of (profs ?? []) as Array<{
      id: string;
      full_name: string | null;
      team_id: string | null;
      hire_date: string | null;
      staff_type_keys: string[] | null;
    }>) {
      mProfMap.set(p.id, p);
    }

    const now = new Date();
    const staff: HrMatrixStaff[] = staffIds.map((sid) => {
      const p = mProfMap.get(sid);
      const team = p?.team_id ? teamMap.get(p.team_id) : undefined;
      const staffTypeKeys: string[] = p?.staff_type_keys ?? [];
      const cellsMap = compByStaff.get(sid) ?? new Map<string, HrMatrixCell>();
      const cells: Record<string, HrMatrixCell> = {};
      // Pre-compute applicable per requirement using shared helper.
      const applicableByReq = new Map<string, boolean>();
      for (const req of requirements) {
        applicableByReq.set(
          req.requirement_id,
          isRequirementApplicable({
            applies_to: req.applies_to_staff_types,
            applies_to_confirmed_at: req.applies_to_confirmed_at,
            staff_type_keys: staffTypeKeys,
          }),
        );
      }
      for (const [k, v] of cellsMap) {
        cells[k] = { ...v, applicable: applicableByReq.get(k) ?? true };
      }
      // For non-applicable requirements with no completion row, inject a
      // placeholder cell so the matrix can render N/A consistently.
      for (const req of requirements) {
        const isApp = applicableByReq.get(req.requirement_id) ?? true;
        if (!isApp && !cells[req.requirement_id]) {
          cells[req.requirement_id] = {
            status: "not_started",
            completed_date: null,
            expires_at: null,
            evidence_document_id: null,
            training_completion_id: null,
            auto_checked_at: null,
            applicable: false,
          };
        }
      }
      // Inject cumulative-progress into every cumulative requirement's cell.
      for (const cfg of cumulativeConfigByReqId.values()) {
        const k = contribKey(sid, cfg.requirement_id);
        const progress = computeAnnualHoursProgress({
          config: cfg,
          hire_date: p?.hire_date ?? null,
          training_contributions: contribMap.get(k) ?? [],
          entries: entryMap.get(k) ?? [],
          now,
        });
        cells[cfg.requirement_id] = {
          ...(cells[cfg.requirement_id] ?? {
            status: "not_started",
            completed_date: null,
            expires_at: null,
            evidence_document_id: null,
            training_completion_id: null,
            auto_checked_at: null,
            applicable: applicableByReq.get(cfg.requirement_id) ?? true,
          }),
          cumulative_progress: progress,
          applicable: applicableByReq.get(cfg.requirement_id) ?? true,
        };
      }
      return {
        staff_id: sid,
        full_name: p?.full_name ?? "—",
        team_id: p?.team_id ?? null,
        team_name: team?.name ?? null,
        manager_id: team?.manager_id ?? null,
        manager_name: team?.manager_id
          ? (managerNames.get(team.manager_id) ?? null)
          : null,
        staff_type_keys: staffTypeKeys,
        cells,
      };
    });

    staff.sort((a, b) => a.full_name.localeCompare(b.full_name));
    return { requirements, staff };
  });
