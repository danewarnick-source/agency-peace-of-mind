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
  completion: {
    id: string | null;
    status: string;
    completed_date: string | null;
    expires_at: string | null;
    evidence_document_id: string | null;
    notes: string | null;
    completed_by: string | null;
    training_completion_id: string | null;
    auto_checked_at: string | null;
  };
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

    const [{ data: base, error: baseErr }, { data: comp, error: compErr }] =
      await Promise.all([
        sb.rpc("get_hr_staff_checklist_base", { _org: data.organization_id }),
        sb
          .from("staff_checklist_completion")
          .select("*")
          .eq("organization_id", data.organization_id)
          .eq("staff_id", data.staff_id),
      ]);
    if (baseErr) throw new Error(baseErr.message);
    if (compErr) throw new Error(compErr.message);

    const compMap = new Map<string, Record<string, unknown>>();
    for (const c of comp ?? []) compMap.set(c.requirement_id as string, c);

    return (base ?? []).map((r: Record<string, unknown>) => {
      const c = compMap.get(r.id as string);
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        requirement_id: r.id as string,
        title: (r.title as string) ?? (r.short_label as string) ?? "Untitled",
        category: (r.category as string) ?? null,
        source_citation: (r.source_citation as string) ?? null,
        evidence_type: (r.evidence_type as string) ?? null,
        renewal_frequency: (r.renewal_frequency as string) ?? null,
        checklist_layer: (meta.checklist_layer as string) ?? null,
        completion: {
          id: (c?.id as string) ?? null,
          status: (c?.status as string) ?? "not_started",
          completed_date: (c?.completed_date as string) ?? null,
          expires_at: (c?.expires_at as string) ?? null,
          evidence_document_id: (c?.evidence_document_id as string) ?? null,
          notes: (c?.notes as string) ?? null,
          completed_by: (c?.completed_by as string) ?? null,
        },
      };
    });
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("staff_checklist_completion")
      .upsert(
        {
          organization_id: data.organization_id,
          staff_id: data.staff_id,
          requirement_id: data.requirement_id,
          status: data.status,
          completed_date: data.completed_date ?? null,
          expires_at: data.expires_at ?? null,
          evidence_document_id: data.evidence_document_id ?? null,
          notes: data.notes ?? null,
          completed_by: userId,
        },
        { onConflict: "staff_id,requirement_id" },
      );
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
    // Self may read own PII but not edit it (mirrors checklist policy).
    if (userId === data.staff_id) {
      throw new Error("Forbidden: staff may not edit own PII");
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
    const baseItems: Array<{ id: string; title: string }> = (base ?? []).map(
      (r: Record<string, unknown>) => ({
        id: r.id as string,
        title:
          (r.title as string) ?? (r.short_label as string) ?? "Untitled",
      }),
    );
    const totalRequired = baseItems.length;
    const baseIds = new Set(baseItems.map((b) => b.id));
    const titleById = new Map(baseItems.map((b) => [b.id, b.title]));

    // 3. Names / team / hire_date (non-PII) for the gated staff set.
    const { data: profs } = await sb
      .from("profiles")
      .select("id, full_name, team_id, hire_date")
      .in("id", staffIds);
    const profMap = new Map<string, { full_name: string | null; team_id: string | null; hire_date: string | null }>();
    for (const p of profs ?? []) {
      profMap.set(p.id, {
        full_name: p.full_name,
        team_id: p.team_id,
        hire_date: p.hire_date,
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

    // 4. Completions for those staff only.
    const { data: comps } = await sb
      .from("staff_checklist_completion")
      .select("staff_id, requirement_id, status, expires_at")
      .eq("organization_id", data.organization_id)
      .in("staff_id", staffIds);
    const compByStaff = new Map<
      string,
      Map<string, { status: string; expires_at: string | null }>
    >();
    for (const c of comps ?? []) {
      if (!baseIds.has(c.requirement_id)) continue;
      if (!compByStaff.has(c.staff_id)) compByStaff.set(c.staff_id, new Map());
      compByStaff
        .get(c.staff_id)!
        .set(c.requirement_id, { status: c.status, expires_at: c.expires_at });
    }

    const todayMs = Date.now();
    const in30Ms = todayMs + 30 * 86400_000;
    const newHireCutoffMs = todayMs - 60 * 86400_000;

    const rows: HrRollupRow[] = staffIds.map((sid) => {
      const p = profMap.get(sid);
      const cmap = compByStaff.get(sid) ?? new Map();
      let complete = 0;
      let expired = 0;
      let nextRenewal: HrRollupRow["next_renewal"] = null;
      let nextRenewalTs = Infinity;
      for (const b of baseItems) {
        const c = cmap.get(b.id);
        if (c?.status === "complete") complete++;
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
      const openGaps = Math.max(0, totalRequired - complete);
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
