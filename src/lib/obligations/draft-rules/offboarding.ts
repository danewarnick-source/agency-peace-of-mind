/**
 * Offboarding / change-impact recalculation (draft simulation).
 * Recalculate when role, assignment, client needs, credential, or supervisor
 * changes. A departing ACRE supervisor triggers reassignment review for SEI
 * staff. Historical evidence stays on the file.
 */

export const CHANGE_TRIGGERS = [
  "role",
  "assignment",
  "client_needs",
  "credential",
  "supervisor",
] as const;
export type ChangeTrigger = (typeof CHANGE_TRIGGERS)[number];

export const IMPACT_KINDS = [
  "recalculate",
  "reassignment_review",
  "preserve_historical_evidence",
] as const;
export type ImpactKind = (typeof IMPACT_KINDS)[number];

export type ChangeSnapshot = {
  staffId: string;
  role: string | null;
  assignedClientIds: string[];
  assignedServiceCodes: string[];
  clientNeedFlags: string[];
  credentialKeys: string[];
  supervisorId: string | null;
  supervisorAcreCertified: boolean | null;
};

export type HistoricalEvidenceRef = {
  evidenceId: string;
  ruleId: string;
  lifecycle: string;
};

export type SyntheticChangeEvent = {
  staffId: string;
  trigger: ChangeTrigger;
  before: ChangeSnapshot;
  after: ChangeSnapshot;
  historicalEvidence: HistoricalEvidenceRef[];
};

export type ChangeImpactItem = {
  kind: ImpactKind;
  staffId: string;
  trigger: ChangeTrigger;
  reason: string;
  preserveEvidenceIds: string[];
};

export type SimulatedOffboardingResult = {
  impacts: ChangeImpactItem[];
  preservedEvidenceIds: string[];
  wroteDatabase: false;
  deletedHistoricalEvidence: false;
};

function codesIncludeSei(codes: readonly string[]): boolean {
  return codes.some((c) => c.trim().toUpperCase() === "SEI");
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].map((v) => v.trim()).sort();
  const right = [...b].map((v) => v.trim()).sort();
  return left.every((v, i) => v === right[i]);
}

function snapshotChanged(
  trigger: ChangeTrigger,
  before: ChangeSnapshot,
  after: ChangeSnapshot,
): boolean {
  if (trigger === "role") return (before.role ?? "") !== (after.role ?? "");
  if (trigger === "assignment") {
    return (
      !sameSet(before.assignedClientIds, after.assignedClientIds) ||
      !sameSet(before.assignedServiceCodes, after.assignedServiceCodes)
    );
  }
  if (trigger === "client_needs") return !sameSet(before.clientNeedFlags, after.clientNeedFlags);
  if (trigger === "credential") return !sameSet(before.credentialKeys, after.credentialKeys);
  return (before.supervisorId ?? "") !== (after.supervisorId ?? "");
}

export function departingAcreSupervisor(event: SyntheticChangeEvent): boolean {
  if (event.trigger !== "supervisor") return false;
  if (!snapshotChanged("supervisor", event.before, event.after)) return false;
  if (event.before.supervisorAcreCertified !== true) return false;
  if (!event.before.supervisorId) return false;
  return event.after.supervisorId !== event.before.supervisorId;
}

export function seiStaffNeedsAcreReassignmentReview(event: SyntheticChangeEvent): boolean {
  if (!departingAcreSupervisor(event)) return false;
  return (
    codesIncludeSei(event.before.assignedServiceCodes) ||
    codesIncludeSei(event.after.assignedServiceCodes)
  );
}

function preserveIds(event: SyntheticChangeEvent): string[] {
  return event.historicalEvidence.map((row) => row.evidenceId);
}

/**
 * Recalculate the impact list for encoded change triggers.
 * Never deletes historical evidence. SEI + departing ACRE supervisor
 * adds a reassignment-review item.
 */
export function simulateChangeImpact(
  events: readonly SyntheticChangeEvent[],
): SimulatedOffboardingResult {
  const impacts: ChangeImpactItem[] = [];
  const preserved = new Set<string>();

  for (const event of events) {
    const ids = preserveIds(event);
    for (const id of ids) preserved.add(id);

    if (!snapshotChanged(event.trigger, event.before, event.after)) continue;

    impacts.push({
      kind: "recalculate",
      staffId: event.staffId,
      trigger: event.trigger,
      reason: `${event.trigger} changed — recalculate applicable draft duties.`,
      preserveEvidenceIds: ids,
    });

    if (seiStaffNeedsAcreReassignmentReview(event)) {
      impacts.push({
        kind: "reassignment_review",
        staffId: event.staffId,
        trigger: "supervisor",
        reason:
          "Departing ACRE supervisor — SEI staff need a qualified-supervisor reassignment review (SOW §30.6(b)).",
        preserveEvidenceIds: ids,
      });
    }

    if (ids.length > 0) {
      impacts.push({
        kind: "preserve_historical_evidence",
        staffId: event.staffId,
        trigger: event.trigger,
        reason:
          "Historical evidence stays on the file; change impact does not delete prior records.",
        preserveEvidenceIds: ids,
      });
    }
  }

  return {
    impacts,
    preservedEvidenceIds: [...preserved],
    wroteDatabase: false,
    deletedHistoricalEvidence: false,
  };
}
