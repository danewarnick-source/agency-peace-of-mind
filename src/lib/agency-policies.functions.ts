/**
 * Agency Policies binder — admin CRUD + obligation fan-out.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import {
  AGENCY_POLICY_ATTESTATION,
  AGENCY_POLICY_BUCKET,
  AGENCY_POLICY_MAX_BYTES,
  AGENCY_POLICY_SOURCE_SECTION,
  isAllowedPolicyFile,
  isPolicyAudienceKind,
  policyHasContent,
  staffMatchesPolicyAudience,
  type AgencyPolicyRow,
  type PolicyAudienceKind,
  type StaffAudienceFacts,
} from "@/lib/agency-policies";
import { ensureOpenStaffObligationInternal } from "@/lib/ensure-staff-obligation";
import { addToAllStaffGroupInternal, ensureAllStaffGroupInternal } from "@/lib/staff-groups.functions";
import { mergeDueDayPackFields } from "@/lib/obligation-packs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type AgencyPolicyView = AgencyPolicyRow & {
  audience_label: string;
  open_count: number;
};

export type JobCodeOption = { key: string; label: string };

const CreatePolicyInput = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  audienceKind: z.enum(["everyone", "drivers", "job_code"]),
  audienceJobCode: z.string().trim().max(60).optional().nullable(),
  bodyText: z.string().max(200_000).optional().nullable(),
  filePath: z.string().max(2000).optional().nullable(),
  fileName: z.string().max(255).optional().nullable(),
  fileMime: z.string().max(255).optional().nullable(),
  fileSizeBytes: z.number().int().min(0).max(AGENCY_POLICY_MAX_BYTES).optional().nullable(),
});

async function assertAdmin(
  supabase: AnySupabase,
  orgId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_org_admin_or_manager", {
    _org: orgId,
    _user: userId,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only an admin or manager can manage the policy binder.");
}

function audienceLabelFor(kind: PolicyAudienceKind, jobCode: string | null): string {
  if (kind === "everyone") return "Everyone";
  if (kind === "drivers") return "Drivers";
  return jobCode ? `Job code ${jobCode}` : "A job code";
}

async function loadStaffFacts(
  supabase: AnySupabase,
  organizationId: string,
): Promise<Array<{ id: string; full_name: string | null; role: string; facts: StaffAudienceFacts }>> {
  const { data: mems, error: memErr } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (memErr) throw new Error(memErr.message);
  const members = (mems ?? []) as Array<{ user_id: string; role: string }>;
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return [];

  const [{ data: profs }, { data: assigns }, { data: transport }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, staff_type_keys, position, department")
      .in("id", ids),
    supabase
      .from("staff_assignments")
      .select("staff_id, service_codes")
      .eq("organization_id", organizationId)
      .in("staff_id", ids),
    supabase.from("day_program_transport").select("transport_staff_id").in("transport_staff_id", ids),
  ]);

  const transporters = new Set(
    ((transport ?? []) as Array<{ transport_staff_id: string | null }>)
      .map((r) => r.transport_staff_id)
      .filter((id): id is string => !!id),
  );
  const codesByStaff = new Map<string, string[]>();
  for (const a of (assigns ?? []) as Array<{ staff_id: string; service_codes: string[] | null }>) {
    const list = codesByStaff.get(a.staff_id) ?? [];
    for (const c of a.service_codes ?? []) list.push(c);
    codesByStaff.set(a.staff_id, list);
  }

  const roleById = new Map(members.map((m) => [m.user_id, m.role]));
  return ((profs ?? []) as Array<{
    id: string;
    full_name: string | null;
    staff_type_keys: string[] | null;
    position: string | null;
    department: string | null;
  }>).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    role: roleById.get(p.id) ?? "employee",
    facts: {
      staffTypeKeys: p.staff_type_keys ?? [],
      position: p.position,
      department: p.department,
      assignedServiceCodes: codesByStaff.get(p.id) ?? [],
      isTransporter:
        transporters.has(p.id) || (codesByStaff.get(p.id) ?? []).some((c) => c.toUpperCase() === "MTP"),
    },
  }));
}

async function matchingStaffForPolicy(
  supabase: AnySupabase,
  organizationId: string,
  kind: PolicyAudienceKind,
  jobCode: string | null,
): Promise<Array<{ id: string; full_name: string | null; role: string }>> {
  const all = await loadStaffFacts(supabase, organizationId);
  return all
    .filter((s) => staffMatchesPolicyAudience({ kind, jobCode }, s.facts))
    .map((s) => ({ id: s.id, full_name: s.full_name, role: s.role }));
}

async function fanOutPolicyObligation(
  supabase: AnySupabase,
  organizationId: string,
  policy: AgencyPolicyRow,
  createdBy: string,
): Promise<string> {
  const jobCode = policy.audience_job_code;
  const matching = await matchingStaffForPolicy(
    supabase,
    organizationId,
    policy.audience_kind,
    jobCode,
  );
  const allStaffGroup = await ensureAllStaffGroupInternal(supabase, organizationId);
  const assignedUsers = policy.audience_kind === "everyone" ? [] : matching.map((s) => s.id);
  const assignedGroups = policy.audience_kind === "everyone" ? [allStaffGroup] : [];

  const { data: inserted, error } = await supabase
    .from("company_obligations")
    .insert({
      organization_id: organizationId,
      title: policy.title,
      description:
        (policy.body_text ?? "").trim() ||
        "Read or watch this agency policy, then attest. No quiz.",
      source_policy_section: AGENCY_POLICY_SOURCE_SECTION,
      cadence: "one_time",
      due_day_config: mergeDueDayPackFields(
        { days_after_hire: 30 },
        { packKey: "onboarding", packName: "Onboarding", isRequired: true },
      ),
      reminder_days_before: [14, 7, 3, 0],
      evidence_type: "attestation",
      attestation_text: AGENCY_POLICY_ATTESTATION,
      requires_individual_completion: true,
      assigned_to_groups: assignedGroups,
      assigned_to_users: assignedUsers,
      assignee_role: "any_assigned",
      scope: "staff",
      target_service_codes: policy.audience_kind === "job_code" && jobCode ? [jobCode] : [],
      source: "provider",
      is_locked: false,
      agency_policy_id: policy.id,
      created_by: createdBy,
    })
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inserted) throw new Error("Could not turn this policy into an obligation.");

  for (const staff of matching) {
    await addToAllStaffGroupInternal(supabase, organizationId, staff.id);
    await ensureOpenStaffObligationInternal(
      supabase,
      organizationId,
      [policy.title],
      staff,
      { dueDays: 30, periodPrefix: "Policy" },
    );
  }
  return inserted.id as string;
}

export async function assignMatchingPoliciesForStaffInternal(
  supabase: AnySupabase,
  organizationId: string,
  staffId: string,
): Promise<void> {
  const { data: policies, error } = await supabase
    .from("agency_policies")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (error) {
    if (/agency_policies|schema cache|does not exist/i.test(error.message ?? "")) return;
    throw new Error(error.message);
  }
  const rows = (policies ?? []) as AgencyPolicyRow[];
  if (!rows.length) return;

  const all = await loadStaffFacts(supabase, organizationId);
  const staff = all.find((s) => s.id === staffId);
  if (!staff) return;

  for (const policy of rows) {
    if (
      !staffMatchesPolicyAudience(
        { kind: policy.audience_kind, jobCode: policy.audience_job_code },
        staff.facts,
      )
    ) {
      continue;
    }
    if (!policy.obligation_id && !policy.title) continue;
    const titles = policy.title ? [policy.title] : [];
    if (!titles.length) continue;
    await ensureOpenStaffObligationInternal(
      supabase,
      organizationId,
      titles,
      { id: staff.id, full_name: staff.full_name, role: staff.role },
      { dueDays: 30, periodPrefix: "Policy" },
    );
  }
}

export const listAgencyPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<AgencyPolicyView[]> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: rows, error } = await supabase
      .from("agency_policies")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("active", true)
      .order("created_at", { ascending: false });
    if (error) {
      if (/agency_policies|schema cache|does not exist/i.test(error.message ?? "")) return [];
      throw new Error(error.message);
    }
    const policies = (rows ?? []) as AgencyPolicyRow[];
    const obligationIds = policies.map((p) => p.obligation_id).filter((id): id is string => !!id);
    const openByOb = new Map<string, number>();
    if (obligationIds.length) {
      const { data: inst } = await supabase
        .from("company_obligation_instances")
        .select("obligation_id")
        .in("obligation_id", obligationIds)
        .in("status", ["pending", "overdue"]);
      for (const row of (inst ?? []) as Array<{ obligation_id: string }>) {
        openByOb.set(row.obligation_id, (openByOb.get(row.obligation_id) ?? 0) + 1);
      }
    }
    return policies.map((p) => ({
      ...p,
      audience_label: audienceLabelFor(p.audience_kind, p.audience_job_code),
      open_count: p.obligation_id ? (openByOb.get(p.obligation_id) ?? 0) : 0,
    }));
  });

export const listPolicyJobCodeOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ organizationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<JobCodeOption[]> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [];
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: types } = await supabase
      .from("staff_types")
      .select("key, label")
      .eq("organization_id", data.organizationId)
      .order("label");
    const out = new Map<string, JobCodeOption>();
    for (const t of (types ?? []) as Array<{ key: string; label: string | null }>) {
      out.set(t.key.toUpperCase(), { key: t.key, label: t.label || t.key });
    }
    for (const c of EVV_SERVICE_CODES) {
      if (!out.has(c.code)) out.set(c.code, { key: c.code, label: c.label });
    }
    return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label));
  });

export const createAgencyPolicyUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().max(255).optional(),
        sizeBytes: z.number().int().min(1).max(AGENCY_POLICY_MAX_BYTES),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { objectPath: null as string | null, upload: null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    await assertAdmin(supabase, data.organizationId, userId);

    const fileErr = isAllowedPolicyFile({
      name: data.fileName,
      type: data.mimeType,
      size: data.sizeBytes,
    });
    if (fileErr) throw new Error(fileErr);

    const safeName = data.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectPath = `${data.organizationId}/inbox/${crypto.randomUUID()}-${safeName}`;
    const { data: signed, error } = await supabase.storage
      .from(AGENCY_POLICY_BUCKET)
      .createSignedUploadUrl(objectPath);
    if (error) throw new Error(error.message);
    return {
      objectPath,
      upload: {
        signed_url: signed.signedUrl as string,
        token: signed.token as string,
        path: signed.path as string,
      },
    };
  });

export const createAgencyPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CreatePolicyInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { policy: null as AgencyPolicyRow | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    await assertAdmin(supabase, data.organizationId, userId);

    if (data.audienceKind === "job_code" && !data.audienceJobCode?.trim()) {
      throw new Error("Pick a job code for this audience.");
    }
    if (!isPolicyAudienceKind(data.audienceKind)) {
      throw new Error("Choose everyone, drivers, or a job code.");
    }
    if (!policyHasContent({ bodyText: data.bodyText, fileName: data.fileName })) {
      throw new Error("Add a file or paste the policy text.");
    }
    if (data.fileName && data.fileSizeBytes) {
      const fileErr = isAllowedPolicyFile({
        name: data.fileName,
        type: data.fileMime ?? undefined,
        size: data.fileSizeBytes,
      });
      if (fileErr) throw new Error(fileErr);
    }

    const { data: inserted, error } = await supabase
      .from("agency_policies")
      .insert({
        organization_id: data.organizationId,
        title: data.title,
        audience_kind: data.audienceKind,
        audience_job_code: data.audienceKind === "job_code" ? data.audienceJobCode?.trim() ?? null : null,
        body_text: (data.bodyText ?? "").trim() || null,
        file_path: data.filePath ?? null,
        file_name: data.fileName ?? null,
        file_mime: data.fileMime ?? null,
        file_size_bytes: data.fileSizeBytes ?? null,
        created_by: userId,
        active: true,
      })
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inserted) throw new Error("Could not add this policy.");

    const policy = inserted as AgencyPolicyRow;
    const obligationId = await fanOutPolicyObligation(
      supabase,
      data.organizationId,
      policy,
      userId,
    );
    const { data: linked, error: upErr } = await supabase
      .from("agency_policies")
      .update({ obligation_id: obligationId })
      .eq("id", policy.id)
      .eq("organization_id", data.organizationId)
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);
    return { policy: (linked ?? { ...policy, obligation_id: obligationId }) as AgencyPolicyRow };
  });

export const getAgencyPolicyForInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        instanceId: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return { policy: null as AgencyPolicyRow | null, signedUrl: null as string | null };
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: inst, error: iErr } = await supabase
      .from("company_obligation_instances")
      .select("id, obligation_id")
      .eq("id", data.instanceId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (iErr) throw new Error(iErr.message);
    if (!inst) return { policy: null, signedUrl: null };

    const { data: assignee } = await supabase
      .from("company_obligation_instance_assignees")
      .select("staff_id")
      .eq("instance_id", data.instanceId)
      .eq("staff_id", userId)
      .maybeSingle();
    const { data: isAdmin } = await supabase.rpc("is_org_admin_or_manager", {
      _org: data.organizationId,
      _user: userId,
    });
    if (!assignee && !isAdmin) return { policy: null, signedUrl: null };

    const { data: policy, error: pErr } = await supabase
      .from("agency_policies")
      .select("*")
      .eq("organization_id", data.organizationId)
      .eq("obligation_id", inst.obligation_id)
      .maybeSingle();
    if (pErr) {
      if (/agency_policies|schema cache|does not exist/i.test(pErr.message ?? "")) {
        return { policy: null, signedUrl: null };
      }
      throw new Error(pErr.message);
    }
    if (!policy) return { policy: null, signedUrl: null };

    let signedUrl: string | null = null;
    if (policy.file_path) {
      const { data: signed } = await supabase.storage
        .from(AGENCY_POLICY_BUCKET)
        .createSignedUrl(policy.file_path as string, 3600);
      signedUrl = signed?.signedUrl ?? null;
    }
    return { policy: policy as AgencyPolicyRow, signedUrl };
  });
