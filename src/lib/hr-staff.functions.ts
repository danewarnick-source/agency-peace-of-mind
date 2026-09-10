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
  isRequirementApplicable,
  parseAppliesTo,
} from "@/lib/staff-applicability";
import {
  BASELINE_STAFF_TRAININGS,
  baselineRequirementId,
  trainingDueDateFor,
  isBaselineApplicable,
} from "@/lib/staff-training-requirements";

const orgStaff = z.object({
  organization_id: z.string().uuid(),
  staff_id: z.string().uuid(),
});

/**
 * Shared status computation for a baseline training row, given its raw
 * `staff_baseline_training_completions` record (or undefined if none yet).
 *   complete   = admin signed off AND not expired
 *   expired    = past expiration OR (no completion and past due date)
 *   in_progress= evidence uploaded, awaiting admin sign-off
 *   not_started= nothing on file
 */
function computeBaselineStatus(
  t: (typeof BASELINE_STAFF_TRAININGS)[number],
  bc: Record<string, unknown> | undefined,
  hireDate: Date | null,
) {
  const completedDate = (bc?.completed_date as string | null) ?? null;
  const expiresAt = (bc?.expires_at as string | null) ?? null;
  const evidenceDocId = (bc?.evidence_document_id as string | null) ?? null;
  const adminSignedOffAt = (bc?.admin_signed_off_at as string | null) ?? null;
  const todayMs = Date.now();
  const expMs = expiresAt ? new Date(`${expiresAt}T00:00:00Z`).getTime() : null;
  let status: string = "not_started";
  if (adminSignedOffAt) {
    status = expMs !== null && expMs < todayMs ? "expired" : "complete";
  } else if (evidenceDocId) {
    status = "in_progress";
  } else {
    const due = trainingDueDateFor(t, hireDate);
    if (due && new Date(`${due}T00:00:00Z`).getTime() < todayMs) {
      status = "expired";
    } else {
      status = "not_started";
    }
  }
  return { status, completedDate, expiresAt, evidenceDocId, adminSignedOffAt };
}

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
    if (!supabase || !userId) return null;
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
    if (!supabase || !userId) return [];
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
  phase: string | null;
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
function baselinePhaseFor(key: string): string | null {
  switch (key) {
    case "thirty_day":
    case "cpr_first_aid":
    case "deescalation":
    case "background_screening":
    case "medicaid_fraud_exclusion":
    case "dhhs_code_of_conduct":
      return "within_30_days";
    case "abi":
    case "acre_usu_workplace_support":
    case "bcba_credential":
    case "rn_lpn_license":
      return "within_180_days";
    case "annual_12h":
      return "annual";
    default:
      return null;
  }
}




export const getStaffChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orgStaff.parse(d))
  .handler(async ({ data, context }): Promise<ChecklistRow[]> => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [];
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
      { data: assignments },
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
        .from("staff_assignments")
        .select("service_codes")
        .eq("organization_id", data.organization_id)
        .eq("staff_id", data.staff_id),
    ]);
    if (baseErr) throw new Error(baseErr.message);
    if (compErr) throw new Error(compErr.message);

    const assignedCodes: string[] = Array.from(
      new Set(
        ((assignments ?? []) as Array<{ service_codes: string[] | null }>)
          .flatMap((a) => a.service_codes ?? [])
          .filter(Boolean)
          .map((c) => c.toUpperCase()),
      ),
    );

    const staffTypeKeys: string[] =
      (prof?.staff_type_keys as string[] | null) ?? [];
    const hireDateStr =
      (prof?.start_date as string | null) ??
      (prof?.hire_date as string | null) ??
      null;
    const hireDate = hireDateStr ? new Date(`${hireDateStr}T00:00:00Z`) : null;
    // Explicit, provider-decided setting only — no auto-detection from client
    // caseload. Defaults to Required at the DB level.
    const requiresDeescalation =
      (prof?.requires_deescalation as boolean | undefined) !== false;
    const requiresAbi =
      (prof?.requires_abi as boolean | undefined) !== false;

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
          phase: typeof meta.phase === "string" ? (meta.phase as string) : null,
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
        assignedCodes,
      });
      const bc = baselineMap.get(t.key);
      const nectarNameMatch =
        (bc?.nectar_name_match as string | null) ?? null;
      const nectarExtractedName =
        (bc?.nectar_extracted_name as string | null) ?? null;
      const nectarReviewedAt =
        (bc?.nectar_reviewed_at as string | null) ?? null;
      const { status, completedDate, expiresAt, evidenceDocId, adminSignedOffAt } =
        computeBaselineStatus(t, bc, hireDate);
      return {
        requirement_id: baselineRequirementId(t.key),
        title: t.title,
        category: t.category,
        phase: baselinePhaseFor(t.key),
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
    if (!supabase || !userId) return { ok: false };
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

    // Renewable requirements (metadata.is_renewable + renewal_interval_months)
    // get a durable expiration stamped at completion time — same behavior as
    // the annually-expiring baseline trainings. Explicit input always wins.
    let effExpires = data.expires_at ?? null;
    if (!effExpires && data.completed_date) {
      const { data: reqRow } = await sb
        .from("nectar_requirements")
        .select("metadata")
        .eq("id", data.requirement_id)
        .maybeSingle();
      const meta = (reqRow?.metadata ?? {}) as Record<string, unknown>;
      if (
        meta.is_renewable === true &&
        typeof meta.renewal_interval_months === "number"
      ) {
        effExpires = addMonthsIso(
          data.completed_date,
          meta.renewal_interval_months as number,
        );
      }
    }

    const payload = {
      organization_id: data.organization_id,
      staff_id: data.staff_id,
      requirement_id: data.requirement_id,
      client_id: null as string | null,
      status: data.status,
      completed_date: data.completed_date ?? null,
      expires_at: effExpires,
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
    if (!supabase || !userId) return { ok: false };
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
    if (!supabase || !userId) return [];
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
    if (!supabase || !userId)
      return { hr_document_id: null, object_path: null, upload: null };
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
    if (!supabase || !userId)
      return { signed_url: null, file_name: null, expires_in_seconds: 0 };
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
    if (!supabase || !userId) return { ok: false };
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

// ---------------------------------------------------------------------------
// Renewable HR checklist expirations — feeds the Deadlines panel.
// Any staff-checklist requirement whose metadata carries
// { is_renewable: true, renewal_interval_months: N } produces a renewal
// deadline once a staffer has completed it (Medicaid Disclosure is the first).
// ---------------------------------------------------------------------------

export interface HrChecklistRenewal {
  requirement_id: string;
  requirement_title: string;
  staff_id: string;
  staff_name: string;
  due_date: string; // YYYY-MM-DD
}

export const getHrChecklistRenewals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ organization_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!supabase || !userId) return [] as HrChecklistRenewal[];
    await requireOrgMembership(supabase, userId, data.organization_id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;

    const { data: base } = await sb.rpc("get_hr_staff_checklist_base", {
      _org: data.organization_id,
    });
    const renewable = new Map<string, { title: string; months: number }>();
    for (const r of (base ?? []) as Array<Record<string, unknown>>) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      if (
        meta.is_renewable === true &&
        typeof meta.renewal_interval_months === "number"
      ) {
        renewable.set(r.id as string, {
          title:
            (meta.short_label as string) ??
            (r.title as string) ??
            "Requirement",
          months: meta.renewal_interval_months as number,
        });
      }
    }
    if (renewable.size === 0) return [] as HrChecklistRenewal[];

    const { data: comps } = await sb
      .from("staff_checklist_completion")
      .select("staff_id, requirement_id, status, completed_date, expires_at")
      .eq("organization_id", data.organization_id)
      .in("requirement_id", Array.from(renewable.keys()))
      .is("client_id", null);

    const rows = (comps ?? []) as Array<{
      staff_id: string;
      requirement_id: string;
      status: string;
      completed_date: string | null;
      expires_at: string | null;
    }>;
    if (rows.length === 0) return [] as HrChecklistRenewal[];

    const staffIds = Array.from(new Set(rows.map((r) => r.staff_id)));
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name")
      .in("id", staffIds);
    const nameById = new Map<string, string>();
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
      nameById.set(p.id, p.full_name ?? "Staff member");
    }

    const out: HrChecklistRenewal[] = [];
    for (const c of rows) {
      const req = renewable.get(c.requirement_id);
      if (!req) continue;
      const due =
        c.expires_at ??
        (c.completed_date ? addMonthsIso(c.completed_date, req.months) : null);
      if (!due) continue;
      out.push({
        requirement_id: c.requirement_id,
        requirement_title: req.title,
        staff_id: c.staff_id,
        staff_name: nameById.get(c.staff_id) ?? "Staff member",
        due_date: due,
      });
    }
    out.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return out;
  });
