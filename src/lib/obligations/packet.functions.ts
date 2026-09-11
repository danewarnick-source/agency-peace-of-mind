// Server loaders for Step 6 packets. No new tables. Scope/facts degrade
// when Step 3/5 columns are not live yet.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { sowCatalogEntry, sowCatalogEntryByKey } from "@/lib/sow-obligation-catalog";
import { EMPTY_ORG_FACTS, loadOrgFacts, type OrgFacts } from "@/lib/obligations/applicability";
import { loadStaffDutyFactsInternal } from "@/lib/obligations/load-staff-duty-facts.functions";
import {
  loadOrgScopeSnapshot,
  orgWideResolvedScope,
  resolveScopeFromSnapshot,
  type ResolvedScope,
} from "@/lib/obligations/scope";
import {
  buildPacket,
  hiddenAgencyCardKeys,
  hiddenClientCardKeys,
  type Packet,
  type PacketClock,
  type PacketSubjectKind,
} from "@/lib/obligations/packet";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

const UUID_CHUNK = 80;

function chunkIds(ids: string[]): string[][] {
  if (!ids.length) return [];
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += UUID_CHUNK) {
    out.push(ids.slice(i, i + UUID_CHUNK));
  }
  return out;
}

async function loadPacketClocks(
  supabase: AnySupabase,
  organizationId: string,
): Promise<PacketClock[]> {
  const { data: obligations, error: oErr } = await supabase
    .from("company_obligations")
    .select("id, title, key, scope, disposition")
    .eq("organization_id", organizationId);
  if (oErr) throw new Error(oErr.message);
  const obs = (obligations ?? []) as Array<{
    id: string;
    title: string;
    key?: string | null;
    scope: string;
    disposition?: string | null;
  }>;
  if (!obs.length) return [];
  const byId = new Map(obs.map((o) => [o.id, o]));

  const { data: instances, error: iErr } = await supabase
    .from("company_obligation_instances")
    .select("id, obligation_id, status, due_at, upload_path, assignee_staff_id, client_id")
    .eq("organization_id", organizationId);
  if (iErr) throw new Error(iErr.message);

  const clocks: PacketClock[] = [];
  for (const row of (instances ?? []) as Array<{
    id: string;
    obligation_id: string;
    status: "pending" | "completed" | "overdue" | "waived";
    due_at: string;
    upload_path: string | null;
    assignee_staff_id: string | null;
    client_id: string | null;
  }>) {
    const ob = byId.get(row.obligation_id);
    if (!ob) continue;
    const catalog = (ob.key ? sowCatalogEntryByKey(ob.key) : null) ?? sowCatalogEntry(ob.title);
    clocks.push({
      obligationKey: catalog?.key ?? ob.key ?? ob.title,
      title: ob.title,
      instanceId: row.id,
      instanceStatus: row.status,
      dueAt: row.due_at,
      hasValidEvidence: row.status === "completed" || row.status === "waived" || !!row.upload_path,
      staffUserId: row.assignee_staff_id,
      clientId: row.client_id,
    });
  }

  const missingStaff = clocks.filter((c) => !c.staffUserId && c.instanceId);
  if (missingStaff.length) {
    const instanceIds = missingStaff.map((c) => c.instanceId!).filter(Boolean);
    const assignees: Array<{ instance_id: string; staff_id: string }> = [];
    for (const ids of chunkIds(instanceIds)) {
      const { data, error } = await supabase
        .from("company_obligation_instance_assignees")
        .select("instance_id, staff_id")
        .eq("organization_id", organizationId)
        .in("instance_id", ids);
      if (error) break;
      assignees.push(...((data ?? []) as Array<{ instance_id: string; staff_id: string }>));
    }
    const firstByInstance = new Map<string, string>();
    for (const a of assignees) {
      if (!firstByInstance.has(a.instance_id)) firstByInstance.set(a.instance_id, a.staff_id);
    }
    for (const clock of clocks) {
      if (clock.staffUserId || !clock.instanceId) continue;
      clock.staffUserId = firstByInstance.get(clock.instanceId) ?? null;
    }
  }

  return clocks;
}

export async function assembleCompliancePacket(args: {
  supabase: AnySupabase;
  organizationId: string;
  viewerUserId: string;
  subject: PacketSubjectKind;
  subjectId: string | null;
}): Promise<Packet> {
  const [snapshot, factsRaw, clocks] = await Promise.all([
    loadOrgScopeSnapshot(args.supabase, args.organizationId),
    loadOrgFacts(args.supabase, args.organizationId),
    loadPacketClocks(args.supabase, args.organizationId),
  ]);
  const facts: OrgFacts = factsRaw ?? { ...EMPTY_ORG_FACTS };
  const scope: ResolvedScope = snapshot.available
    ? resolveScopeFromSnapshot(args.organizationId, args.viewerUserId, snapshot)
    : orgWideResolvedScope(args.organizationId, args.viewerUserId);

  let staffDutyFacts = null;
  if (args.subject === "staff" && args.subjectId) {
    const map = await loadStaffDutyFactsInternal(args.supabase, args.organizationId, [
      args.subjectId,
    ]);
    staffDutyFacts = map.get(args.subjectId) ?? null;
  }

  return buildPacket({
    organizationId: args.organizationId,
    subject: args.subject,
    subjectId: args.subjectId,
    viewerUserId: args.viewerUserId,
    scope,
    facts,
    clocks,
    staffDutyFacts,
  });
}

export type CompliancePacketPayload = {
  packet: Packet;
  scopedStaffIds: string[] | null;
  hiddenAgencyCards: string[];
  hiddenClientCards: string[];
};

export const getCompliancePacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        organizationId: z.string().uuid(),
        subject: z.enum(["staff", "client", "agency"]),
        subjectId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<CompliancePacketPayload | null> => {
    const { supabase, userId } = context as { supabase: AnySupabase; userId: string };
    if (!supabase || !userId) return null;

    const subjectId = data.subjectId ?? null;
    const ownStaffPacket = data.subject === "staff" && subjectId === userId;
    if (ownStaffPacket) {
      await requireOrgMembership(supabase, userId, data.organizationId, "employee");
    } else {
      await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    }

    const packet = await assembleCompliancePacket({
      supabase,
      organizationId: data.organizationId,
      viewerUserId: userId,
      subject: data.subject,
      subjectId,
    });

    return {
      packet,
      scopedStaffIds: packet.staffUserIds,
      hiddenAgencyCards: hiddenAgencyCardKeys(packet),
      hiddenClientCards: hiddenClientCardKeys(packet),
    };
  });
