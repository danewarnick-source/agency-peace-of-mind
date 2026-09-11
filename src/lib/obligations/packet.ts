// Compliance revamp Step 6 — Packets.
// Pure assembler. File panels and my-obligations next action consume this.
// Uses landed Step 3 `resolveScope` and the real Step 5 `applicability.ts`
// from main. No stub copy of that module.

import {
  allSowCatalogEntries,
  sowCatalogEntry,
  sowCatalogEntryByKey,
  type SowCatalogEntry,
} from "../sow-obligation-catalog.ts";
import {
  emptyObligationFileStatusCounts,
  statusForObligationInstance,
  tallyObligationFileStatus,
  type ObligationFileStatus,
  type ObligationFileStatusCounts,
} from "../staff-obligation-files.ts";
import {
  computeObligationApplicability,
  obligationFactApplicability,
  type OrgFacts,
} from "./applicability.ts";
import { evvStaffIdsForScope, resolveScope, staffInScope, type ResolvedScope } from "./scope.ts";
import { evaluateStaffDuty, type StaffDutyFacts } from "./duty-applicability.ts";

export { resolveScope, staffInScope, evvStaffIdsForScope };
export { computeObligationApplicability, obligationFactApplicability };

export type PacketSubjectKind = "staff" | "client" | "agency";

export type PacketClock = {
  obligationKey: string;
  title: string;
  instanceId: string | null;
  instanceStatus: "pending" | "completed" | "overdue" | "waived" | null;
  dueAt: string | null;
  hasValidEvidence: boolean;
  staffUserId?: string | null;
  clientId?: string | null;
};

export type BuildPacketInput = {
  organizationId: string;
  subject: PacketSubjectKind;
  /** Staff user id or client id. Null = org-wide file for that subject. */
  subjectId: string | null;
  viewerUserId: string;
  scope: ResolvedScope;
  facts: OrgFacts;
  clocks: PacketClock[];
  catalog?: SowCatalogEntry[];
  now?: Date;
  /** Live staff assignment facts. Office / unmatched duties hide; unanswered stays. */
  staffDutyFacts?: StaffDutyFacts | null;
};

export type PacketItemStatus = ObligationFileStatus | "does_not_apply" | "unanswered";

export type PacketItem = {
  obligationKey: string;
  title: string;
  subject: PacketSubjectKind;
  status: PacketItemStatus;
  applies: boolean;
  unanswered: boolean;
  dueAt: string | null;
  instanceId: string | null;
  instanceStatus: PacketClock["instanceStatus"];
  href: string;
  staffUserId: string | null;
  clientId: string | null;
};

export type PacketNextAction = {
  obligationKey: string;
  title: string;
  reason: string;
  href: string;
  urgency: "critical" | "high" | "normal";
  dueAt: string | null;
};

export type Packet = {
  organizationId: string;
  subject: PacketSubjectKind;
  subjectId: string | null;
  viewerUserId: string;
  scoped: boolean;
  /** Staff user ids visible when scoped. Null when org-wide. */
  staffUserIds: string[] | null;
  items: PacketItem[];
  hiddenKeys: string[];
  hiddenCount: number;
  counts: ObligationFileStatusCounts;
  nextAction: PacketNextAction | null;
};

const URGENCY_ORDER = { critical: 0, high: 1, normal: 2 } as const;

export const AGENCY_CARD_KEY_BY_OBLIGATION: Record<string, string> = {
  zoning_life_safety: "facility_safety",
  governing_board_records: "board",
  human_rights_plan: "hrc_hrp",
  volunteer_training_file: "volunteer",
};

export const CLIENT_CARD_KEY_BY_OBLIGATION: Record<string, string> = {
  housemate_informed_choice: "housemate",
};

export function packetSubjectForCatalog(
  entry: Pick<SowCatalogEntry, "owner" | "category" | "disposition">,
): PacketSubjectKind | null {
  if (entry.disposition === "retired") return null;
  if (entry.category === "client_docs" || entry.owner === "host") return "client";
  if (entry.owner === "staff") return "staff";
  return "agency";
}

export function packetItemHref(subject: PacketSubjectKind, instanceId?: string | null): string {
  if (subject === "staff") {
    return instanceId
      ? `/dashboard/my-obligations#packet-${instanceId}`
      : "/dashboard/my-obligations";
  }
  if (subject === "client") return "/dashboard/compliance?tab=client";
  return "/dashboard/compliance?tab=agency";
}

export function clocksFromMyInstances(
  rows: Array<{
    id: string;
    status: "pending" | "completed" | "overdue" | "waived";
    due_at: string;
    upload_path?: string | null;
    assignee_staff_id?: string | null;
    client_id?: string | null;
    obligation: {
      title: string;
      key?: string | null;
    };
  }>,
): PacketClock[] {
  return rows.map((row) => {
    const catalog =
      (row.obligation.key ? sowCatalogEntryByKey(row.obligation.key) : null) ??
      sowCatalogEntry(row.obligation.title);
    return {
      obligationKey: catalog?.key ?? row.obligation.key ?? row.obligation.title,
      title: row.obligation.title,
      instanceId: row.id,
      instanceStatus: row.status,
      dueAt: row.due_at,
      hasValidEvidence: row.status === "completed" || row.status === "waived" || !!row.upload_path,
      staffUserId: row.assignee_staff_id ?? null,
      clientId: row.client_id ?? null,
    };
  });
}

function catalogAppliesToServices(entry: SowCatalogEntry, services: string[]): boolean {
  if (!entry.service_codes.length) return true;
  if (!services.length) return true;
  const have = new Set(services.map((c) => c.toUpperCase()));
  return entry.service_codes.some((c) => have.has(c.toUpperCase()));
}

function itemStatus(
  clock: PacketClock | undefined,
  unanswered: boolean,
  now: Date,
): PacketItemStatus {
  if (!clock) return unanswered ? "unanswered" : "missing";
  if (!clock.instanceStatus || !clock.dueAt) {
    return clock.hasValidEvidence ? "on_file" : unanswered ? "unanswered" : "missing";
  }
  return statusForObligationInstance({
    instanceStatus: clock.instanceStatus,
    dueAt: clock.dueAt,
    instanceUploadPath: clock.hasValidEvidence ? "on-file" : null,
    now,
  });
}

function nextActionFromItems(items: PacketItem[], now: Date): PacketNextAction | null {
  const candidates: Array<PacketNextAction & { sortDue: number }> = [];
  for (const item of items) {
    if (item.status === "on_file" || item.status === "does_not_apply") continue;
    const overdue =
      item.status === "missing" && !!item.dueAt && new Date(item.dueAt).getTime() < now.getTime();
    let urgency: PacketNextAction["urgency"] = "normal";
    let reason = "Due soon.";
    if (item.status === "unanswered") {
      urgency = "high";
      reason = "Still deciding whether this applies.";
    } else if (overdue) {
      urgency = "critical";
      reason = "Overdue — complete this first.";
    } else if (item.status === "missing") {
      urgency = "high";
      reason = "Missing from the file.";
    }
    candidates.push({
      obligationKey: item.obligationKey,
      title: item.title,
      reason,
      href: item.href,
      urgency,
      dueAt: item.dueAt,
      sortDue: item.dueAt ? new Date(item.dueAt).getTime() : Number.POSITIVE_INFINITY,
    });
  }
  candidates.sort((a, b) => {
    const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (u !== 0) return u;
    return a.sortDue - b.sortDue;
  });
  const first = candidates[0];
  if (!first) return null;
  return {
    obligationKey: first.obligationKey,
    title: first.title,
    reason: first.reason,
    href: first.href,
    urgency: first.urgency,
    dueAt: first.dueAt,
  };
}

export function buildPacket(input: BuildPacketInput): Packet {
  const now = input.now ?? new Date();
  const catalog = input.catalog ?? allSowCatalogEntries();
  const scoped = !input.scope.isOrgWide;

  const staffUserIds = evvStaffIdsForScope(input.scope);

  if (input.subject === "staff" && input.subjectId && !staffInScope(input.scope, input.subjectId)) {
    return {
      organizationId: input.organizationId,
      subject: input.subject,
      subjectId: input.subjectId,
      viewerUserId: input.viewerUserId,
      scoped,
      staffUserIds,
      items: [],
      hiddenKeys: [],
      hiddenCount: 0,
      counts: emptyObligationFileStatusCounts(),
      nextAction: null,
    };
  }

  const clocks = input.clocks.filter((clock) => {
    if (input.subject === "staff" && input.subjectId) {
      return !clock.staffUserId || clock.staffUserId === input.subjectId;
    }
    if (input.subject === "staff" && staffUserIds) {
      return !clock.staffUserId || staffUserIds.includes(clock.staffUserId);
    }
    if (input.subject === "client" && input.subjectId) {
      return !clock.clientId || clock.clientId === input.subjectId;
    }
    return true;
  });

  const hiddenKeys: string[] = [];
  const items: PacketItem[] = [];
  const counts = emptyObligationFileStatusCounts();
  const factByKey = new Map(
    computeObligationApplicability(input.facts).map((row) => [row.obligationKey, row]),
  );

  for (const entry of catalog) {
    const subject = packetSubjectForCatalog(entry);
    if (subject !== input.subject) continue;
    if (!catalogAppliesToServices(entry, input.facts.servicesOffered)) {
      hiddenKeys.push(entry.key);
      continue;
    }
    const fact = factByKey.get(entry.key) ?? obligationFactApplicability(entry.key, input.facts);
    if (fact?.status === "does_not_apply") hiddenKeys.push(entry.key);
    if (
      input.subject === "staff" &&
      input.staffDutyFacts &&
      evaluateStaffDuty({
        dutyKey: entry.key,
        staff: input.staffDutyFacts,
        orgFacts: input.facts,
      }).status === "does_not_apply"
    ) {
      if (!hiddenKeys.includes(entry.key)) hiddenKeys.push(entry.key);
    }
  }

  const pushItem = (item: PacketItem) => {
    items.push(item);
    if (item.status === "on_file" || item.status === "due_soon" || item.status === "missing") {
      tallyObligationFileStatus(counts, item.status);
    }
  };

  const seen = new Set<string>();
  for (const clock of clocks) {
    const catalogEntry = sowCatalogEntryByKey(clock.obligationKey) ?? sowCatalogEntry(clock.title);
    const subject = catalogEntry ? packetSubjectForCatalog(catalogEntry) : input.subject;
    if (subject !== input.subject) continue;
    const key = catalogEntry?.key ?? clock.obligationKey;
    if (hiddenKeys.includes(key)) continue;
    const stamp = `${key}:${clock.instanceId ?? ""}`;
    if (seen.has(stamp)) continue;
    seen.add(stamp);
    const fact = factByKey.get(key);
    const staffDuty =
      input.subject === "staff" && input.staffDutyFacts
        ? evaluateStaffDuty({
            dutyKey: key,
            staff: input.staffDutyFacts,
            orgFacts: input.facts,
          })
        : null;
    const status = itemStatus(clock, !!staffDuty?.unanswered || !!fact?.unanswered, now);
    pushItem({
      obligationKey: key,
      title: clock.title,
      subject: input.subject,
      status,
      applies: staffDuty ? staffDuty.applies : fact ? fact.applies : true,
      unanswered: !!staffDuty?.unanswered || !!fact?.unanswered,
      dueAt: clock.dueAt,
      instanceId: clock.instanceId,
      instanceStatus: clock.instanceStatus,
      href: packetItemHref(input.subject, clock.instanceId),
      staffUserId: clock.staffUserId ?? (input.subject === "staff" ? input.subjectId : null),
      clientId: clock.clientId ?? (input.subject === "client" ? input.subjectId : null),
    });
  }

  // Fact-gated and unanswered staff-duty rows stay visible until answered.
  for (const entry of catalog) {
    if (packetSubjectForCatalog(entry) !== input.subject) continue;
    if (hiddenKeys.includes(entry.key)) continue;
    const fact = factByKey.get(entry.key);
    const staffDuty =
      input.subject === "staff" && input.staffDutyFacts
        ? evaluateStaffDuty({
            dutyKey: entry.key,
            staff: input.staffDutyFacts,
            orgFacts: input.facts,
          })
        : null;
    const unanswered = !!fact?.unanswered || !!staffDuty?.unanswered;
    if (!unanswered) continue;
    if (seen.has(`${entry.key}:`)) continue;
    seen.add(`${entry.key}:`);
    pushItem({
      obligationKey: entry.key,
      title: entry.title,
      subject: input.subject,
      status: "unanswered",
      applies: true,
      unanswered: true,
      dueAt: null,
      instanceId: null,
      instanceStatus: null,
      href: packetItemHref(input.subject, null),
      staffUserId: input.subject === "staff" ? input.subjectId : null,
      clientId: input.subject === "client" ? input.subjectId : null,
    });
  }

  items.sort((a, b) => {
    const order = (s: PacketItemStatus) =>
      s === "missing" ? 0 : s === "due_soon" ? 1 : s === "unanswered" ? 2 : 3;
    const d = order(a.status) - order(b.status);
    if (d !== 0) return d;
    return (a.dueAt ?? "").localeCompare(b.dueAt ?? "") || a.title.localeCompare(b.title);
  });

  return {
    organizationId: input.organizationId,
    subject: input.subject,
    subjectId: input.subjectId,
    viewerUserId: input.viewerUserId,
    scoped,
    staffUserIds,
    items,
    hiddenKeys,
    hiddenCount: hiddenKeys.length,
    counts,
    nextAction: nextActionFromItems(items, now),
  };
}

export function hiddenAgencyCardKeys(packet: Packet): string[] {
  return packet.hiddenKeys
    .map((key) => AGENCY_CARD_KEY_BY_OBLIGATION[key])
    .filter((key): key is string => !!key);
}

export function hiddenClientCardKeys(packet: Packet): string[] {
  return packet.hiddenKeys
    .map((key) => CLIENT_CARD_KEY_BY_OBLIGATION[key])
    .filter((key): key is string => !!key);
}
