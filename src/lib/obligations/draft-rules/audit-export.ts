/**
 * Draft audit-export packet shape.
 * Filtered fields only. Retention is "from applicable authority".
 * Do not invent a universal retention period — that stays a publication gap.
 */

export const AUDIT_PACKET_FIELDS = [
  "rule_version",
  "source_clause",
  "assignment",
  "evidence",
  "acceptance",
  "timestamps",
  "exceptions",
  "amendments",
] as const;
export type AuditPacketField = (typeof AUDIT_PACKET_FIELDS)[number];

export const AUDIT_RETENTION = {
  field: "retention",
  value: "from_applicable_authority",
  knownUniversalPeriod: null,
  publicationGap:
    "No universal retention period is encoded. Use the applicable authority. Do not invent a default (for example a 7-year) interval.",
} as const;

export type AuditExportAssignment = {
  assignmentId: string;
  staffId: string | null;
  clientId: string | null;
  ruleId: string;
};

export type AuditExportEvidence = {
  evidenceId: string;
  scope: string | null;
  lifecycle: string;
};

export type AuditExportAcceptance = {
  accepted: boolean;
  acceptedAt: string | null;
  acceptedBy: string | null;
};

export type AuditExportTimestamps = {
  assignedAt: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  exportedAt: string;
};

export type AuditExportException = {
  key: string;
  reason: string;
};

export type AuditExportAmendment = {
  amendmentId: string;
  summary: string;
  recordedAt: string;
};

export type AuditExportRowInput = {
  ruleId: string;
  ruleVersion: number;
  sourceClauseIds: string[];
  assignment: AuditExportAssignment;
  evidence: AuditExportEvidence[];
  acceptance: AuditExportAcceptance;
  timestamps: Omit<AuditExportTimestamps, "exportedAt">;
  exceptions: AuditExportException[];
  amendments: AuditExportAmendment[];
};

export type AuditExportRow = {
  rule_version: { ruleId: string; version: number };
  source_clause: string[];
  assignment: AuditExportAssignment;
  evidence: AuditExportEvidence[];
  acceptance: AuditExportAcceptance;
  timestamps: AuditExportTimestamps;
  exceptions: AuditExportException[];
  amendments: AuditExportAmendment[];
};

export type SimulatedAuditPacket = {
  fields: readonly AuditPacketField[];
  retention: typeof AUDIT_RETENTION;
  rows: AuditExportRow[];
  inventedUniversalRetention: false;
  wroteDatabase: false;
};

export function buildAuditExportPacket(input: {
  rows: readonly AuditExportRowInput[];
  exportedAt: string;
}): SimulatedAuditPacket {
  return {
    fields: AUDIT_PACKET_FIELDS,
    retention: AUDIT_RETENTION,
    inventedUniversalRetention: false,
    wroteDatabase: false,
    rows: input.rows.map((row) => ({
      rule_version: { ruleId: row.ruleId, version: row.ruleVersion },
      source_clause: [...row.sourceClauseIds],
      assignment: row.assignment,
      evidence: row.evidence,
      acceptance: row.acceptance,
      timestamps: { ...row.timestamps, exportedAt: input.exportedAt },
      exceptions: row.exceptions,
      amendments: row.amendments,
    })),
  };
}

export function auditPacketHasOnlyFilteredFields(packet: SimulatedAuditPacket): boolean {
  const keys = new Set(packet.fields);
  return (
    AUDIT_PACKET_FIELDS.every((field) => keys.has(field)) &&
    keys.size === AUDIT_PACKET_FIELDS.length
  );
}
