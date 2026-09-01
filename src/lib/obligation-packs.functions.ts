/**
 * Admin Obligations pack matrix — reads existing company_obligations +
 * instances. Custom packs persist as tagged provider rows (and an
 * obligation_packs table once the additive migration is applied).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import {
  cellIncrementsRed,
  customPackKeyFromConfig,
  customPackNameFromConfig,
  HIVE_PACK_ASSIGN_FIELD,
  isLockedPackKey,
  isPackSentinel,
  LOCKED_PACK_KEYS,
  LOCKED_PACK_LABEL,
  mergeDueDayPackFields,
  newCustomPackKey,
  obligationIsRequired,
  packCellStatus,
  packColumnForObligation,
  readDueDayConfig,
  staffInitials,
  type PackAssignSpec,
  type PackCellStatus,
} from "./obligation-packs";
import { ensureAllStaffGroupInternal } from "./staff-groups.functions";
import { generateNextInstanceInternal } from "./company-obligations.functions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export type PackTabRow = {
  packKey: string;
  name: string;
  locked: boolean;
  assign: PackAssignSpec;
};

export type PackMatrixStaff = {
  id: string;
  full_name: string;
  initials: string;
  role: string;
};

export type PackMatrixColumn = {
  columnKey: string;
  obligationIds: string[];
  label: string;
  required: boolean;
  evidenceType: "attestation" | "upload" | "upload_and_attestation" | "form" | string;
  completeCount: number;
  assignedCount: number;
  redCount: number;
};

export type PackMatrixCell = {
  columnKey: string;
  staffId: string;
  obligationId: string | null;
  instanceId: string | null;
  assigned: boolean;
  complete: boolean;
  required: boolean;
  status: PackCellStatus;
};

export type PackMatrix = {
  packs: PackTabRow[];
  staff: PackMatrixStaff[];
  columns: PackMatrixColumn[];
  cells: PackMatrixCell[];
  jobCodes: Array<{ key: string; label: string }>;
  existingItems: Array<{ id: string; title: string; packKey: string | null }>;
};

export type JobCodeOption = { key: string; label: string };

function emptyAssign(): PackAssignSpec {
  return { roles: [], jobCodes: [], groupIds: [], userIds: [] };
}

function assignFromConfig(raw: unknown): PackAssignSpec {
  const cfg = readDueDayConfig(raw);
  const stored = cfg[HIVE_PACK_ASSIGN_FIELD];
  if (!stored || typeof stored !== "object") return emptyAssign();
  const s = stored as Partial<PackAssignSpec>;
  return {
    roles: Array.isArray(s.roles) ? s.roles.filter((x): x is string => typeof x === "string") : [],
    jobCodes: Array.isArray(s.jobCodes)
      ? s.jobCodes.filter((x): x is string => typeof x === "string")
      : [],
    groupIds: Array.isArray(s.groupIds)
      ? s.groupIds.filter((x): x is string => typeof x === "string")
      : [],
    userIds: Array.isArray(s.userIds)
      ? s.userIds.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function tableMissing(message: string | undefined): boolean {
  return /does not exist|schema cache|obligation_packs/i.test(message ?? "");
}

function columnMissing(message: string | undefined): boolean {
  return /column|schema cache|pack_key|is_required/i.test(message ?? "");
}

type ObRow = {
  id: string;
  title: string;
  description: string | null;
  source: string | null;
  source_policy_section: string | null;
  scope: string | null;
  evidence_type: string | null;
  active: boolean | null;
  is_locked: boolean | null;
  assigned_to_groups: string[] | null;
  assigned_to_users: string[] | null;
  due_day_config: unknown;
  pack_key?: string | null;
  is_required?: boolean | null;
  agency_policy_id?: string | null;
};

type InstRow = {
  id: string;
  obligation_id: string;
  status: string;
  assignee_staff_id: string | null;
  due_at: string | null;
};

async function loadPackTable(
  supabase: AnySupabase,
  organizationId: string,
): Promise<PackTabRow[]> {
  const { data, error } = await supabase
    .from("obligation_packs")
    .select("pack_key, name, is_locked, assign_roles, assign_job_codes, assigned_to_groups, assigned_to_users, sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{
    pack_key: string;
    name: string;
    is_locked: boolean;
    assign_roles: string[] | null;
    assign_job_codes: string[] | null;
    assigned_to_groups: string[] | null;
    assigned_to_users: string[] | null;
  }>).map((r) => ({
    packKey: r.pack_key,
    name: r.name,
    locked: r.is_locked,
    assign: {
      roles: r.assign_roles ?? [],
      jobCodes: r.assign_job_codes ?? [],
      groupIds: r.assigned_to_groups ?? [],
      userIds: r.assigned_to_users ?? [],
    },
  }));
}

async function upsertPackTable(
  supabase: AnySupabase,
  organizationId: string,
  pack: PackTabRow,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase.from("obligation_packs").upsert(
    {
      organization_id: organizationId,
      pack_key: pack.packKey,
      name: pack.name,
      is_locked: pack.locked,
      assign_roles: pack.assign.roles,
      assign_job_codes: pack.assign.jobCodes,
      assigned_to_groups: pack.assign.groupIds,
      assigned_to_users: pack.assign.userIds,
      sort_order: pack.locked ? 0 : 100,
      created_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,pack_key" },
  );
  if (error) {
    if (tableMissing(error.message)) return false;
    throw new Error(error.message);
  }
  return true;
}

async function loadStaff(
  supabase: AnySupabase,
  organizationId: string,
): Promise<PackMatrixStaff[]> {
  const { data: mems, error: memErr } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("active", true);
  if (memErr) throw new Error(memErr.message);
  const members = (mems ?? []) as Array<{ user_id: string; role: string }>;
  const ids = members.map((m) => m.user_id);
  if (!ids.length) return [];

  const { data: profs, error: pErr } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  if (pErr) throw new Error(pErr.message);
  const nameById = new Map(
    ((profs ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
      p.id,
      (p.full_name ?? "").trim() || "Staff",
    ]),
  );
  const roleById = new Map(members.map((m) => [m.user_id, m.role]));

  return ids
    .map((id) => {
      const full_name = nameById.get(id) ?? "Staff";
      return {
        id,
        full_name,
        initials: staffInitials(full_name),
        role: roleById.get(id) ?? "employee",
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function loadJobCodes(
  supabase: AnySupabase,
  organizationId: string,
): Promise<JobCodeOption[]> {
  const { data, error } = await supabase
    .from("staff_types")
    .select("key, label")
    .eq("organization_id", organizationId)
    .order("label", { ascending: true });
  if (error) {
    if (/staff_types|schema cache|does not exist/i.test(error.message ?? "")) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{ key: string; label: string | null }>).map((r) => ({
    key: r.key,
    label: r.label?.trim() || r.key,
  }));
}

async function resolveAssignUserIds(
  supabase: AnySupabase,
  organizationId: string,
  assign: PackAssignSpec,
): Promise<string[]> {
  const ids = new Set<string>(assign.userIds);
  if (assign.roles.length) {
    const { data, error } = await supabase
      .from("organization_members")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .in("role", assign.roles);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ user_id: string }>) ids.add(r.user_id);
  }
  if (assign.jobCodes.length) {
    const { data: mems, error: mErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("active", true);
    if (mErr) throw new Error(mErr.message);
    const memberIds = ((mems ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
    if (memberIds.length) {
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, staff_type_keys")
        .in("id", memberIds);
      if (pErr) throw new Error(pErr.message);
      const wanted = new Set(assign.jobCodes);
      for (const p of (profs ?? []) as Array<{ id: string; staff_type_keys: string[] | null }>) {
        if ((p.staff_type_keys ?? []).some((k) => wanted.has(k))) ids.add(p.id);
      }
    }
  }
  return Array.from(ids);
}

function buildMatrix(
  obligations: ObRow[],
  instances: InstRow[],
  assignees: Array<{ instance_id: string; staff_id: string }>,
  completions: Array<{ instance_id: string; staff_id: string | null }>,
  staff: PackMatrixStaff[],
  packKey: string,
): { columns: PackMatrixColumn[]; cells: PackMatrixCell[] } {
  const colMap = new Map<
    string,
    {
      label: string;
      required: boolean;
      evidenceType: string;
      obligationIds: string[];
    }
  >();
  const obById = new Map(obligations.map((o) => [o.id, o]));

  for (const ob of obligations) {
    if (ob.active === false) continue;
    const ref = packColumnForObligation(ob);
    if (!ref || ref.packKey !== packKey) continue;
    const existing = colMap.get(ref.columnKey);
    if (existing) {
      existing.obligationIds.push(ob.id);
      if (ref.required) existing.required = true;
    } else {
      colMap.set(ref.columnKey, {
        label: ref.label,
        required: ref.required,
        evidenceType: ob.evidence_type ?? "attestation",
        obligationIds: [ob.id],
      });
    }
  }

  const instByOb = new Map<string, InstRow[]>();
  for (const inst of instances) {
    const list = instByOb.get(inst.obligation_id) ?? [];
    list.push(inst);
    instByOb.set(inst.obligation_id, list);
  }
  const assigneesByInst = new Map<string, string[]>();
  for (const a of assignees) {
    const list = assigneesByInst.get(a.instance_id) ?? [];
    list.push(a.staff_id);
    assigneesByInst.set(a.instance_id, list);
  }
  const completionKeys = new Set(
    completions.map((c) => `${c.instance_id}:${c.staff_id ?? ""}`),
  );

  const columns: PackMatrixColumn[] = [];
  const cells: PackMatrixCell[] = [];

  for (const [columnKey, col] of colMap) {
    let assignedCount = 0;
    let completeCount = 0;
    let redCount = 0;

    for (const person of staff) {
      const staffInst: InstRow[] = [];
      for (const obId of col.obligationIds) {
        for (const inst of instByOb.get(obId) ?? []) {
          const onRow = inst.assignee_staff_id === person.id;
          const onAssignee = (assigneesByInst.get(inst.id) ?? []).includes(person.id);
          if (onRow || onAssignee) staffInst.push(inst);
        }
      }
      const assigned = staffInst.length > 0;
      const open = staffInst.filter((i) => i.status === "pending" || i.status === "overdue");
      const completed = staffInst.filter(
        (i) =>
          i.status === "completed" ||
          i.status === "waived" ||
          completionKeys.has(`${i.id}:${person.id}`),
      );
      const complete = assigned && open.length === 0 && completed.length > 0;
      const required = col.required;
      const status = packCellStatus({ assigned, complete, required });
      if (assigned) assignedCount += 1;
      if (complete) completeCount += 1;
      if (cellIncrementsRed(status)) redCount += 1;

      const pick = open[0] ?? staffInst[0] ?? null;
      cells.push({
        columnKey,
        staffId: person.id,
        obligationId: pick?.obligation_id ?? col.obligationIds[0] ?? null,
        instanceId: pick?.id ?? null,
        assigned,
        complete,
        required,
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

  void obById;
  return { columns, cells };
}

function mergePackTabs(fromTable: PackTabRow[], obligations: ObRow[]): PackTabRow[] {
  const byKey = new Map<string, PackTabRow>();
  for (const key of LOCKED_PACK_KEYS) {
    byKey.set(key, {
      packKey: key,
      name: LOCKED_PACK_LABEL[key],
      locked: true,
      assign: emptyAssign(),
    });
  }
  for (const row of fromTable) {
    if (isLockedPackKey(row.packKey)) {
      const locked = byKey.get(row.packKey);
      if (locked) locked.assign = row.assign;
      continue;
    }
    byKey.set(row.packKey, { ...row, locked: false });
  }
  for (const ob of obligations) {
    if (!isPackSentinel(ob) && !customPackKeyFromConfig(ob.due_day_config) && !ob.pack_key) {
      continue;
    }
    const key =
      (typeof ob.pack_key === "string" && ob.pack_key.trim()) ||
      customPackKeyFromConfig(ob.due_day_config);
    if (!key || isLockedPackKey(key)) continue;
    if (byKey.has(key)) {
      if (isPackSentinel(ob)) {
        const existing = byKey.get(key)!;
        const assign = assignFromConfig(ob.due_day_config);
        if (
          assign.roles.length ||
          assign.jobCodes.length ||
          assign.groupIds.length ||
          assign.userIds.length
        ) {
          existing.assign = assign;
        }
        const name = customPackNameFromConfig(ob.due_day_config);
        if (name) existing.name = name;
      }
      continue;
    }
    byKey.set(key, {
      packKey: key,
      name: customPackNameFromConfig(ob.due_day_config) || ob.title,
      locked: false,
      assign: assignFromConfig(ob.due_day_config),
    });
  }
  const locked = LOCKED_PACK_KEYS.map((k) => byKey.get(k)!);
  const custom = Array.from(byKey.values())
    .filter((p) => !p.locked)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...locked, ...custom];
}

export const listObligationPackMatrix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        packKey: z.string().min(1).max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }): Promise<PackMatrix> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    const empty: PackMatrix = {
      packs: LOCKED_PACK_KEYS.map((k) => ({
        packKey: k,
        name: LOCKED_PACK_LABEL[k],
        locked: true,
        assign: emptyAssign(),
      })),
      staff: [],
      columns: [],
      cells: [],
      jobCodes: [],
      existingItems: [],
    };
    if (!supabase || !userId) return empty;
    await requireOrgMembership(supabase, userId, data.organizationId, "employee");

    const { data: obRows, error: oErr } = await supabase
      .from("company_obligations")
      .select(
        "id, title, description, source, source_policy_section, scope, evidence_type, active, is_locked, assigned_to_groups, assigned_to_users, due_day_config, pack_key, is_required, agency_policy_id",
      )
      .eq("organization_id", data.organizationId)
      .order("title", { ascending: true });

    let obligations: ObRow[] = [];
    if (oErr) {
      if (columnMissing(oErr.message)) {
        const retry = await supabase
          .from("company_obligations")
          .select(
            "id, title, description, source, source_policy_section, scope, evidence_type, active, is_locked, assigned_to_groups, assigned_to_users, due_day_config",
          )
          .eq("organization_id", data.organizationId)
          .order("title", { ascending: true });
        if (retry.error) throw new Error(retry.error.message);
        obligations = (retry.data ?? []) as ObRow[];
      } else {
        throw new Error(oErr.message);
      }
    } else {
      obligations = (obRows ?? []) as ObRow[];
    }

    const [staff, jobCodes, fromTable] = await Promise.all([
      loadStaff(supabase, data.organizationId),
      loadJobCodes(supabase, data.organizationId),
      loadPackTable(supabase, data.organizationId),
    ]);
    const packs = mergePackTabs(fromTable, obligations);

    const visible = obligations.filter((o) => o.active !== false && !isPackSentinel(o));
    const packObs = visible.filter((o) => packColumnForObligation(o)?.packKey === data.packKey);
    const obligationIds = packObs.map((o) => o.id);

    let instances: InstRow[] = [];
    let assignees: Array<{ instance_id: string; staff_id: string }> = [];
    let completions: Array<{ instance_id: string; staff_id: string | null }> = [];
    if (obligationIds.length) {
      const { data: instRows, error: iErr } = await supabase
        .from("company_obligation_instances")
        .select("id, obligation_id, status, assignee_staff_id, due_at")
        .in("obligation_id", obligationIds);
      if (iErr) throw new Error(iErr.message);
      instances = (instRows ?? []) as InstRow[];
      const instIds = instances.map((i) => i.id);
      if (instIds.length) {
        const [{ data: aRows, error: aErr }, { data: cRows, error: cErr }] = await Promise.all([
          supabase
            .from("company_obligation_instance_assignees")
            .select("instance_id, staff_id")
            .in("instance_id", instIds),
          supabase
            .from("company_obligation_completions")
            .select("instance_id, staff_id")
            .in("instance_id", instIds),
        ]);
        if (aErr) throw new Error(aErr.message);
        if (cErr) throw new Error(cErr.message);
        assignees = (aRows ?? []) as Array<{ instance_id: string; staff_id: string }>;
        completions = (cRows ?? []) as Array<{ instance_id: string; staff_id: string | null }>;
      }
    }

    const { columns, cells } = buildMatrix(
      packObs,
      instances,
      assignees,
      completions,
      staff,
      data.packKey,
    );

    return {
      packs,
      staff,
      columns,
      cells,
      jobCodes,
      existingItems: visible.map((o) => ({
        id: o.id,
        title: o.title,
        packKey: packColumnForObligation(o)?.packKey ?? null,
      })),
    };
  });

async function insertObligation(
  supabase: AnySupabase,
  row: Record<string, unknown>,
): Promise<ObRow> {
  const first = await supabase.from("company_obligations").insert(row).select("*").maybeSingle();
  if (!first.error && first.data) return first.data as ObRow;
  if (first.error && columnMissing(first.error.message)) {
    const stripped = { ...row };
    delete stripped.pack_key;
    delete stripped.is_required;
    const retry = await supabase.from("company_obligations").insert(stripped).select("*").maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
    if (!retry.data) throw new Error("Failed to create obligation.");
    return retry.data as ObRow;
  }
  if (first.error) throw new Error(first.error.message);
  throw new Error("Failed to create obligation.");
}

export const createObligationPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        assign: z
          .object({
            roles: z.array(z.string().max(40)).max(20).default([]),
            jobCodes: z.array(z.string().max(60)).max(40).default([]),
            groupIds: z.array(z.string().uuid()).max(50).default([]),
            userIds: z.array(z.string().uuid()).max(500).default([]),
          })
          .default({ roles: [], jobCodes: [], groupIds: [], userIds: [] }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not signed in.");
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const packKey = newCustomPackKey();
    const assign: PackAssignSpec = {
      roles: data.assign.roles,
      jobCodes: data.assign.jobCodes,
      groupIds: data.assign.groupIds,
      userIds: data.assign.userIds,
    };
    await upsertPackTable(
      supabase,
      data.organizationId,
      { packKey, name: data.name, locked: false, assign },
      userId,
    );

    const assignedUsers = await resolveAssignUserIds(supabase, data.organizationId, assign);
    const allStaff =
      assign.roles.length === 0 &&
      assign.jobCodes.length === 0 &&
      assign.groupIds.length === 0 &&
      assign.userIds.length === 0
        ? await ensureAllStaffGroupInternal(supabase, data.organizationId)
        : null;

    await insertObligation(supabase, {
      organization_id: data.organizationId,
      title: data.name,
      description: "Pack tab",
      source_policy_section: "hive-pack",
      cadence: "one_time",
      due_day_config: mergeDueDayPackFields({}, {
        packKey,
        packName: data.name,
        isRequired: false,
        sentinel: true,
        assign,
      }),
      reminder_days_before: [],
      evidence_type: "attestation",
      attestation_text: null,
      requires_individual_completion: false,
      assigned_to_groups: allStaff ? [allStaff] : assign.groupIds,
      assigned_to_users: assignedUsers,
      assignee_role: "any_assigned",
      scope: "staff",
      target_service_codes: [],
      source: "provider",
      is_locked: false,
      active: true,
      pack_key: packKey,
      is_required: false,
      created_by: userId,
    });

    return { packKey, name: data.name };
  });

export const assignObligationPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        packKey: z.string().min(1).max(80),
        name: z.string().trim().min(1).max(80).optional(),
        assign: z.object({
          roles: z.array(z.string().max(40)).max(20).default([]),
          jobCodes: z.array(z.string().max(60)).max(40).default([]),
          groupIds: z.array(z.string().uuid()).max(50).default([]),
          userIds: z.array(z.string().uuid()).max(500).default([]),
        }),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not signed in.");
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    if (isLockedPackKey(data.packKey) && data.name) {
      throw new Error("Locked packs cannot be renamed.");
    }

    const assign: PackAssignSpec = data.assign;
    const name = data.name?.trim();
    await upsertPackTable(
      supabase,
      data.organizationId,
      {
        packKey: data.packKey,
        name: name || (isLockedPackKey(data.packKey) ? LOCKED_PACK_LABEL[data.packKey] : data.packKey),
        locked: isLockedPackKey(data.packKey),
        assign,
      },
      userId,
    );

    const assignedUsers = await resolveAssignUserIds(supabase, data.organizationId, assign);
    const { data: rows, error } = await supabase
      .from("company_obligations")
      .select("id, title, due_day_config, pack_key, is_locked")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    for (const row of (rows ?? []) as Array<{
      id: string;
      title: string;
      due_day_config: unknown;
      pack_key?: string | null;
      is_locked: boolean | null;
    }>) {
      const key =
        (typeof row.pack_key === "string" && row.pack_key.trim()) ||
        customPackKeyFromConfig(row.due_day_config);
      const mapped = packColumnForObligation({
        id: row.id,
        title: row.title,
        due_day_config: row.due_day_config,
        pack_key: row.pack_key,
      });
      const inPack = key === data.packKey || mapped?.packKey === data.packKey;
      if (!inPack) continue;
      const nextConfig = mergeDueDayPackFields(row.due_day_config, {
        packKey: data.packKey,
        packName: name ?? customPackNameFromConfig(row.due_day_config),
        assign,
      });
      const patch: Record<string, unknown> = {
        due_day_config: nextConfig,
        assigned_to_users: assignedUsers,
        assigned_to_groups: assign.groupIds,
      };
      if (name && !row.is_locked && isPackSentinel({ id: row.id, title: row.title, due_day_config: row.due_day_config })) {
        patch.title = name;
      }
      const upd = await supabase
        .from("company_obligations")
        .update(patch)
        .eq("id", row.id)
        .eq("organization_id", data.organizationId);
      if (upd.error) throw new Error(upd.error.message);
    }

    return { ok: true as const };
  });

export const addPackItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        packKey: z.string().min(1).max(80),
        title: z.string().trim().min(1).max(300),
        kind: z.enum(["upload", "attest"]),
        required: z.boolean().default(true),
        packName: z.string().trim().max(80).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not signed in.");
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const allStaff = await ensureAllStaffGroupInternal(supabase, data.organizationId);
    const inserted = await insertObligation(supabase, {
      organization_id: data.organizationId,
      title: data.title,
      description:
        data.kind === "upload"
          ? "Staff upload a file or card for this item."
          : "Staff read this item and attest.",
      source_policy_section: isLockedPackKey(data.packKey) ? data.packKey : "provider-pack",
      cadence: "one_time",
      due_day_config: mergeDueDayPackFields(
        { days_after_hire: 30 },
        {
          packKey: data.packKey,
          packName: data.packName ?? (isLockedPackKey(data.packKey) ? LOCKED_PACK_LABEL[data.packKey] : undefined),
          isRequired: data.required,
        },
      ),
      reminder_days_before: [7, 3],
      evidence_type: data.kind === "upload" ? "upload" : "attestation",
      attestation_text:
        data.kind === "attest"
          ? "I have read this item and understand what is expected of me."
          : null,
      requires_individual_completion: true,
      assigned_to_groups: [allStaff],
      assigned_to_users: [],
      assignee_role: "any_assigned",
      scope: "staff",
      target_service_codes: [],
      source: "provider",
      is_locked: false,
      active: true,
      pack_key: data.packKey,
      is_required: data.required,
      created_by: userId,
    });

    try {
      await generateNextInstanceInternal(supabase, data.organizationId, inserted.id);
    } catch (e) {
      console.warn("[obligation-packs] could not generate instance:", e);
    }

    return { obligationId: inserted.id };
  });

export const attachExistingToPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        packKey: z.string().min(1).max(80),
        obligationId: z.string().uuid(),
        packName: z.string().trim().max(80).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not signed in.");
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");

    const { data: row, error } = await supabase
      .from("company_obligations")
      .select("id, due_day_config, is_locked")
      .eq("id", data.obligationId)
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Item not found.");
    const existing = row as { id: string; due_day_config: unknown; is_locked: boolean | null };
    if (existing.is_locked && isLockedPackKey(data.packKey) === false) {
      throw new Error("Locked contract items stay on their system pack.");
    }

    const patch: Record<string, unknown> = {
      due_day_config: mergeDueDayPackFields(existing.due_day_config, {
        packKey: data.packKey,
        packName: data.packName,
      }),
      pack_key: data.packKey,
    };
    const upd = await supabase
      .from("company_obligations")
      .update(patch)
      .eq("id", data.obligationId)
      .eq("organization_id", data.organizationId);
    if (upd.error) {
      if (columnMissing(upd.error.message)) {
        const retry = await supabase
          .from("company_obligations")
          .update({ due_day_config: patch.due_day_config })
          .eq("id", data.obligationId)
          .eq("organization_id", data.organizationId);
        if (retry.error) throw new Error(retry.error.message);
      } else {
        throw new Error(upd.error.message);
      }
    }
    return { ok: true as const };
  });

export const deleteCustomPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        packKey: z.string().min(1).max(80),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) throw new Error("Not signed in.");
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    if (isLockedPackKey(data.packKey)) {
      throw new Error("Locked packs cannot be deleted.");
    }

    const del = await supabase
      .from("obligation_packs")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("pack_key", data.packKey);
    if (del.error && !tableMissing(del.error.message)) throw new Error(del.error.message);

    const { data: rows, error } = await supabase
      .from("company_obligations")
      .select("id, due_day_config, pack_key, is_locked, source")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    for (const row of (rows ?? []) as Array<{
      id: string;
      due_day_config: unknown;
      pack_key?: string | null;
      is_locked: boolean | null;
      source: string | null;
    }>) {
      const key =
        (typeof row.pack_key === "string" && row.pack_key.trim()) ||
        customPackKeyFromConfig(row.due_day_config);
      if (key !== data.packKey) continue;
      if (isPackSentinel({ id: row.id, title: "", due_day_config: row.due_day_config })) {
        await supabase
          .from("company_obligations")
          .delete()
          .eq("id", row.id)
          .eq("organization_id", data.organizationId);
        continue;
      }
      if (row.is_locked || row.source === "sow") continue;
      await supabase
        .from("company_obligations")
        .delete()
        .eq("id", row.id)
        .eq("organization_id", data.organizationId);
    }
    return { ok: true as const };
  });
