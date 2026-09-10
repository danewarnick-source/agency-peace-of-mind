import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  checkAndMarkOverdueInternal,
  type CompanyObligationRow,
  type ObligationInstanceRow,
  type StaffObligationCompletion,
} from "@/lib/company-obligations.functions";
import { isPackSentinel } from "@/lib/obligation-packs";
import {
  emptyObligationFileStatusCounts,
  liveObligationTitle,
  statusForObligationInstance,
  tallyObligationFileStatus,
} from "@/lib/staff-obligation-files";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type PersonnelFileMatrixRow = {
  staff_id: string;
  full_name: string;
  role: string;
  job_title: string | null;
  service_codes: string[];
  active: boolean;
  missing: number;
  due_soon: number;
  on_file: number;
  missing_items: Array<{ title: string; due_at: string }>;
};

export type PersonnelFilePackItem = {
  staff_id: string;
  staff_name: string;
  title: string;
  filename: string;
  path: string;
};

export type PersonnelFileIndex = {
  staff: PersonnelFileMatrixRow[];
  pack: PersonnelFilePackItem[];
};

const UUID_CHUNK = 80;

function chunkIds(ids: string[]): string[][] {
  if (!ids.length) return [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += UUID_CHUNK) {
    out.push(ids.slice(i, i + UUID_CHUNK));
  }
  return out;
}

function displayName(profile: {
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
} | null): string {
  const name = profile?.full_name?.trim();
  if (name) return name;
  const username = profile?.username?.trim();
  if (username) return username;
  const email = profile?.email?.trim();
  if (email) return email;
  return "Name not set";
}

/**
 * Org-wide Personnel file index from company_obligation_instances.
 * Same status engine as the per-person tab. No new tables.
 */
export async function loadOrgPersonnelFileIndex(
  supabase: AnySupabase,
  organizationId: string,
  staffFilter?: string[] | null,
): Promise<PersonnelFileIndex> {
  await checkAndMarkOverdueInternal(supabase, organizationId);

  const { data: members, error: mErr } = await supabase
    .from("organization_members")
    .select("user_id, role, job_title, active")
    .eq("organization_id", organizationId);
  if (mErr) throw new Error(mErr.message);

  const filterSet = staffFilter?.length ? new Set(staffFilter) : null;
  const memberRows = (
    (members ?? []) as Array<{
      user_id: string;
      role: string;
      job_title: string | null;
      active: boolean;
    }>
  ).filter((m) => !filterSet || filterSet.has(m.user_id));

  const staffIds = memberRows.map((m) => m.user_id);
  if (!staffIds.length) return { staff: [], pack: [] };

  const profiles: Array<{
    id: string;
    full_name: string | null;
    username: string | null;
    email: string | null;
  }> = [];
  for (const ids of chunkIds(staffIds)) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, username, email")
      .in("id", ids);
    if (error) throw new Error(error.message);
    profiles.push(
      ...((data ?? []) as Array<{
        id: string;
        full_name: string | null;
        username: string | null;
        email: string | null;
      }>),
    );
  }
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const assignedCodesByStaff = new Map<string, string[]>();
  for (const ids of chunkIds(staffIds)) {
    const { data, error } = await supabase
      .from("staff_assignments")
      .select("staff_id, service_codes")
      .eq("organization_id", organizationId)
      .in("staff_id", ids);
    if (error) throw new Error(error.message);
    for (const a of (data ?? []) as Array<{ staff_id: string; service_codes: string[] | null }>) {
      const prev = assignedCodesByStaff.get(a.staff_id) ?? [];
      assignedCodesByStaff.set(
        a.staff_id,
        Array.from(
          new Set([...prev, ...((a.service_codes ?? []).map((c) => c.toUpperCase()))]),
        ),
      );
    }
  }

  const staffToInstances = new Map<string, Set<string>>();
  const addLink = (staffId: string, instanceId: string) => {
    if (!staffToInstances.has(staffId)) staffToInstances.set(staffId, new Set());
    staffToInstances.get(staffId)!.add(instanceId);
  };

  for (const ids of chunkIds(staffIds)) {
    const [{ data: assigneeRows, error: aErr }, { data: directRows, error: dErr }] =
      await Promise.all([
        supabase
          .from("company_obligation_instance_assignees")
          .select("instance_id, staff_id")
          .eq("organization_id", organizationId)
          .in("staff_id", ids),
        supabase
          .from("company_obligation_instances")
          .select("id, assignee_staff_id")
          .eq("organization_id", organizationId)
          .in("assignee_staff_id", ids),
      ]);
    if (aErr) throw new Error(aErr.message);
    if (dErr) throw new Error(dErr.message);
    for (const r of (assigneeRows ?? []) as Array<{ instance_id: string; staff_id: string }>) {
      addLink(r.staff_id, r.instance_id);
    }
    for (const r of (directRows ?? []) as Array<{ id: string; assignee_staff_id: string | null }>) {
      if (r.assignee_staff_id) addLink(r.assignee_staff_id, r.id);
    }
  }

  const instanceIds = Array.from(
    new Set(Array.from(staffToInstances.values()).flatMap((set) => Array.from(set))),
  );

  const instances: ObligationInstanceRow[] = [];
  for (const ids of chunkIds(instanceIds)) {
    const { data, error } = await supabase
      .from("company_obligation_instances")
      .select("*")
      .in("id", ids);
    if (error) throw new Error(error.message);
    instances.push(...((data ?? []) as ObligationInstanceRow[]));
  }
  const instanceById = new Map(instances.map((i) => [i.id, i]));

  const obligationIds = Array.from(new Set(instances.map((i) => i.obligation_id)));
  const obligations: CompanyObligationRow[] = [];
  for (const ids of chunkIds(obligationIds)) {
    const { data, error } = await supabase.from("company_obligations").select("*").in("id", ids);
    if (error) throw new Error(error.message);
    obligations.push(...((data ?? []) as CompanyObligationRow[]));
  }
  const obligationById = new Map(obligations.map((o) => [o.id, o]));

  const completions: StaffObligationCompletion[] = [];
  for (const ids of chunkIds(staffIds)) {
    const { data, error } = await supabase
      .from("company_obligation_completions")
      .select(
        "id, instance_id, staff_id, upload_path, upload_filename, completed_at, evidence_type_used, nectar_validation_status",
      )
      .eq("organization_id", organizationId)
      .in("staff_id", ids);
    if (error) throw new Error(error.message);
    completions.push(
      ...((data ?? []) as Array<StaffObligationCompletion & { staff_id: string }>),
    );
  }

  const completionByStaffInstance = new Map<string, StaffObligationCompletion & { staff_id?: string }>();
  for (const row of completions as Array<StaffObligationCompletion & { staff_id: string }>) {
    const key = `${row.staff_id}:${row.instance_id}`;
    const existing = completionByStaffInstance.get(key);
    if (!existing) {
      completionByStaffInstance.set(key, row);
      continue;
    }
    if (existing.nectar_validation_status === "failed" && row.nectar_validation_status !== "failed") {
      completionByStaffInstance.set(key, row);
    }
  }

  const now = new Date();
  const staffOut: PersonnelFileMatrixRow[] = [];
  const pack: PersonnelFilePackItem[] = [];

  for (const member of memberRows) {
    const profile = profileById.get(member.user_id) ?? null;
    const name = displayName(profile);
    const counts = emptyObligationFileStatusCounts();
    const missingItems: Array<{ title: string; due_at: string }> = [];
    const linked = staffToInstances.get(member.user_id) ?? new Set<string>();

    for (const instanceId of linked) {
      const instance = instanceById.get(instanceId);
      if (!instance) continue;
      const obligation = obligationById.get(instance.obligation_id);
      if (!obligation || isPackSentinel(obligation)) continue;
      const completion = completionByStaffInstance.get(`${member.user_id}:${instance.id}`) ?? null;
      const title = liveObligationTitle(
        obligation.title,
        obligation.scope,
        instance.client_name,
      );
      const status = statusForObligationInstance({
        instanceStatus: instance.status,
        dueAt: instance.due_at,
        instanceUploadPath: instance.upload_path,
        completion,
        now,
      });
      tallyObligationFileStatus(counts, status);
      if (status === "missing") {
        missingItems.push({ title, due_at: instance.due_at });
      }
      const evidencePath = completion?.upload_path ?? instance.upload_path;
      const evidenceName = completion?.upload_filename ?? instance.upload_filename;
      if (status === "on_file" && evidencePath) {
        pack.push({
          staff_id: member.user_id,
          staff_name: name,
          title,
          filename: evidenceName ?? "evidence",
          path: evidencePath,
        });
      }
    }

    missingItems.sort((a, b) => a.due_at.localeCompare(b.due_at) || a.title.localeCompare(b.title));
    staffOut.push({
      staff_id: member.user_id,
      full_name: name,
      role: member.role,
      job_title: member.job_title,
      service_codes: assignedCodesByStaff.get(member.user_id) ?? [],
      active: member.active,
      missing: counts.missing,
      due_soon: counts.due_soon,
      on_file: counts.on_file,
      missing_items: missingItems,
    });
  }

  staffOut.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { staff: staffOut, pack };
}

export const listOrgPersonnelFileMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ organizationId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as PersonnelFileMatrixRow[];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const index = await loadOrgPersonnelFileIndex(supabase, data.organizationId);
    return index.staff;
  });

export const listOrgPersonnelFilePack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        staffIds: z.array(z.string().uuid()).min(1).max(200),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return [] as PersonnelFilePackItem[];
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const index = await loadOrgPersonnelFileIndex(
      supabase,
      data.organizationId,
      data.staffIds,
    );
    const allowed = new Set(data.staffIds);
    return index.pack.filter((p) => allowed.has(p.staff_id));
  });
