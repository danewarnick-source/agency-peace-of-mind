/**
 * Staff / client / location / assignment-scoped facts from the DHHS91172
 * Applicability_Facts workbook. These cannot be asked during agency setup —
 * the records they describe do not exist yet (a brand-new agency has no
 * staff, clients, homes, or assignments the moment it signs up). Each one
 * belongs on the record it describes, once that record exists.
 *
 * Every entry's `storage` says exactly how it resolves:
 *   - "existing_mechanism": already answered by a column or live-path this
 *     app already has (has_abi, guardian_*, housing_voucher, dnr_*, the
 *     transport-assignment live path, etc.) — no new work, just the mapping.
 *   - "derived": computed from another field, never asked directly.
 *   - "generic": genuinely new — stored in public.compliance_fact_answers,
 *     rendered by <ComplianceFactsPanel> on the owning record and surfaced
 *     as a visible information task until answered.
 *
 * agency-setup-questions.coverage.test.ts checks this file plus
 * agency-setup-questions.ts partitions all 85 workbook fact_ids with no gaps
 * and no silent drops. A fact_id may legitimately appear here AND in
 * agency-setup-questions.ts's sourceFactIds only when COMPOUND_SPLIT_FACT_IDS
 * says so (a workbook row whose question mixes an agency-level half with a
 * staff/client-level half, per its own collection_rule: "split compound
 * questions into typed facts").
 */
import type { QuestionScope, AnswerType } from "./agency-setup-questions.ts";

/** Workbook fact_ids intentionally split across an agency question AND a deferred fact. */
export const COMPOUND_SPLIT_FACT_IDS = ["FACT-003", "FACT-065"] as const;

export type DeferredRecordKind =
  | "staff_record"
  | "client_record"
  | "location_record"
  | "assignment_record";

export type DeferredFactStorage =
  | { kind: "existing_mechanism"; description: string }
  | { kind: "derived"; description: string }
  | {
      kind: "generic";
      /** public.compliance_fact_answers.scope */
      scope: Exclude<QuestionScope, "agency">;
    };

export type DeferredFactDefinition = {
  factId: string;
  /** Merge target when this workbook row is a near-duplicate of another deferred fact. */
  duplicateOf?: string;
  scope: Exclude<QuestionScope, "agency">;
  deferredTo: DeferredRecordKind;
  /** Plain-language rewrite of the workbook question, shown on the owning record. */
  question: string;
  help?: string;
  answerType: AnswerType;
  options?: ReadonlyArray<{ value: string; label: string }>;
  storage: DeferredFactStorage;
  sourceRequirementIdsRaw: string;
  sourceNote?: string;
};

// linked_requirement_keys strings copied verbatim from the workbook row so
// the coverage table can show them without re-deriving a union here (each
// deferred fact maps 1:1 to one workbook row, unlike the merged agency
// questions above).
export const DEFERRED_FACTS: readonly DeferredFactDefinition[] = [
  {
    factId: "FACT-003",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Does this staff member drive persons as part of their duties?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description:
        'Already covered by the transport-assignment live path (setup-facts.ts "transport" / ' +
        "driving_record_transport duty) — reads from the live transport assignment, not a stored fact.",
    },
    sourceRequirementIdsRaw:
      "REQ-1.18.2, REQ-1.18.7, REQ-1.30.1, REQ-1.30.3, REQ-2.1.5.B, REQ-2.1.5.E",
    sourceNote:
      "Staff-level half of a compound fact — see COMPOUND_SPLIT_FACT_IDS and q_provides_transportation.",
  },
  {
    factId: "FACT-081",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Does this staff member drive persons in their own vehicle?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description: "Same transport-assignment live path as FACT-003's staff half.",
    },
    sourceRequirementIdsRaw: "REQ-1.30.2",
  },
  {
    factId: "FACT-009",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Does this staff member hold UPI portal access?",
    help: "UPI is admin-only in HIVE — staff never touch it, but the workbook still tracks who holds state-portal access.",
    answerType: "boolean",
    storage: { kind: "generic", scope: "staff" },
    sourceRequirementIdsRaw:
      "REQ-1.4.2, REQ-1.15.1, REQ-1.15.2, REQ-1.15.3, REQ-1.15.4, REQ-1.15.7, REQ-1.15.8, REQ-1.15.9, " +
      "REQ-1.15.12, REQ-1.15.14, REQ-1.15.15, REQ-1.27.1.A, REQ-1.27.2, REQ-1.27.3, REQ-1.27.4",
  },
  {
    factId: "FACT-041",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Who supervises this staff member for this service?",
    answerType: "text",
    storage: {
      kind: "existing_mechanism",
      description: "organization_members.manager_id already records this — no new field.",
    },
    sourceRequirementIdsRaw:
      "REQ-9.4.3, REQ-9.5.2, REQ-15.3.2, REQ-27.4.1, REQ-29.4.2, REQ-30.2.2, REQ-33.5.b",
  },
  {
    factId: "FACT-048",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Is this staff member's service delivered in their own private residence?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "staff" },
    sourceRequirementIdsRaw:
      "REQ-8.4.3, REQ-22.3.2, REQ-23.3.3, REQ-24.3.2, REQ-25.3.3, REQ-26.4.3",
  },
  {
    factId: "FACT-051",
    scope: "staff",
    deferredTo: "staff_record",
    question:
      "Where does this staff member deliver respite (facility 1:6, staff residence 1:3, or community)?",
    answerType: "single_select",
    options: [
      { value: "facility_1_6", label: "Facility (1:6)" },
      { value: "staff_residence_1_3", label: "Staff residence (1:3)" },
      { value: "community", label: "Community" },
    ],
    storage: { kind: "generic", scope: "staff" },
    sourceRequirementIdsRaw: "REQ-22.3.1, REQ-23.3.2, REQ-24.3.1, REQ-25.3.2, REQ-26.3.1",
  },
  {
    factId: "FACT-085",
    scope: "staff",
    deferredTo: "staff_record",
    question: "Is this PN2 staff member an LPN working under RN delegation?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "staff" },
    sourceRequirementIdsRaw: "REQ-19.5.b",
  },

  // --- location (Homes & Teams) ------------------------------------------
  {
    factId: "FACT-022",
    scope: "location",
    deferredTo: "location_record",
    question: "Is this location a site-based facility?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "location" },
    sourceRequirementIdsRaw:
      "REQ-2.1.5.E, REQ-2.1.5.H, REQ-7.3.5, REQ-8.3.3, REQ-8.4.5, REQ-9.3.1, REQ-9.3.5",
  },
  {
    factId: "FACT-061",
    scope: "location",
    deferredTo: "location_record",
    question: "Is this location's program site-based, community-based, or both?",
    answerType: "single_select",
    options: [
      { value: "site_based", label: "Site-based" },
      { value: "community_based", label: "Community-based" },
      { value: "both", label: "Both" },
    ],
    storage: { kind: "generic", scope: "location" },
    sourceRequirementIdsRaw: "REQ-7.3.1, REQ-8.3.1",
  },
  {
    factId: "FACT-062",
    scope: "location",
    deferredTo: "location_record",
    question:
      "How many persons does this location serve (4+ requires a Day Treatment license; 3 or fewer requires certification)?",
    answerType: "number",
    storage: {
      kind: "existing_mechanism",
      description:
        "teams.capacity already exists on the location record — reused, not a new column.",
    },
    sourceRequirementIdsRaw: "REQ-7.5.a, REQ-8.5.a",
    sourceNote:
      'Workbook scopes this "client" (it\'s a headcount) but the fact is about the LOCATION, not ' +
      "any one client — reclassified to location scope.",
  },
  // FACT-063 is not here. It is an agency-level question
  // (q_community_program_total_persons_served in agency-setup-questions.ts),
  // not a deferred location-record fact — see that question's sourceNote
  // for why: REQ-7.5.b/REQ-8.5.b's own applies_to is "agency", not "site",
  // unlike FACT-062's sibling REQ-7.5.a/REQ-8.5.a which really is per-site.

  // --- client --------------------------------------------------------------
  {
    factId: "FACT-017",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client have a legal guardian?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description:
        "clients.is_own_guardian / guardian_name already capture this on the client profile.",
    },
    sourceRequirementIdsRaw:
      "REQ-1.6.2.B, REQ-1.28.7.C, REQ-1.28.7.F, REQ-1.35, REQ-2.1.1, REQ-11.4.3, REQ-15.2.9, REQ-16.2.8, " +
      "REQ-17.2.8, REQ-20.3.9, REQ-20.4.3, REQ-21.3.8.C, REQ-21.4.1, REQ-32.4.5, REQ-32.6.a, REQ-32.6.b",
  },
  {
    factId: "FACT-018",
    scope: "client",
    deferredTo: "client_record",
    question:
      "Is this contractor a representative payee for this client, or does it assist with this client's personal funds?",
    help:
      "This is the yes/no/unknown status. If yes, also record WHO the payee is in the " +
      '"Representative payee" custom field on this client\'s Finance section — that field is a ' +
      "free-text name (e.g. a person or DSPD Trust), not a status, and is not replaced by this " +
      "question.",
    answerType: "boolean",
    storage: {
      kind: "generic",
      scope: "client",
    },
    sourceNote:
      'Previously piggybacked on the client custom-field "representative_payee" ' +
      "(client-profile-fields.ts), which is free text recording WHO the payee is and has no " +
      "unanswered/unknown/not-applicable status — collapsing a missing name into \"no\" would have " +
      "been wrong (a payee can be known to exist before anyone has typed who it is). This question " +
      "is now the authoritative WHETHER-a-payee-relationship-exists status, tracked with the same " +
      "answered/unknown/unanswered states as every other compliance fact. The free-text field is " +
      "untouched and keeps recording WHO, unrelated to and not migrated by this change — no existing " +
      "value in it was read, altered, or reinterpreted as a yes/no answer.",
    sourceRequirementIdsRaw:
      "REQ-1.18.5, REQ-1.22.a.6, REQ-1.28.2, REQ-11.4.1, REQ-15.2.1, REQ-15.2.2, REQ-15.2.3, REQ-15.3.2, " +
      "REQ-15.3.7, REQ-15.3.9, REQ-15.3.11, REQ-15.4.1, REQ-15.4.6, REQ-20.4.1, REQ-20.8.c.1, REQ-21.7.d.1",
  },
  {
    factId: "FACT-058",
    duplicateOf: "FACT-018",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this contractor assist this client with personal funds?",
    answerType: "boolean",
    storage: {
      kind: "generic",
      scope: "client",
    },
    sourceNote: "Same status fact as FACT-018 (asks the same thing in different words).",
    sourceRequirementIdsRaw: "REQ-1.28.4, REQ-1.28.5",
  },
  {
    factId: "FACT-079",
    duplicateOf: "FACT-018",
    scope: "client",
    deferredTo: "client_record",
    question: "Is this contractor this client's SSA representative payee?",
    answerType: "boolean",
    storage: {
      kind: "generic",
      scope: "client",
    },
    sourceNote: "Same status fact as FACT-018 (asks the same thing in different words).",
    sourceRequirementIdsRaw: "REQ-1.28.3",
  },
  {
    factId: "FACT-021",
    scope: "client",
    deferredTo: "client_record",
    question: "Who is this client's host or professional parent?",
    answerType: "text",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw:
      "REQ-1.22.b, REQ-11.3.3, REQ-11.3.4, REQ-11.3.11, REQ-11.4.1, REQ-11.4.2, REQ-11.4.6, REQ-11.4.8, " +
      "REQ-11.5, REQ-11.6, REQ-20.3.3, REQ-20.3.4, REQ-20.3.11, REQ-20.4.8",
    sourceNote:
      'Ambiguous whether "host" should resolve to the client\'s assigned team/manager_id or a free ' +
      "text name — stored generically rather than guessed at a structured relation.",
  },
  {
    factId: "FACT-025",
    scope: "client",
    deferredTo: "client_record",
    question: "Is this client a DCFS/DJJYS client or in state custody?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw:
      "REQ-12.3.2, REQ-13.4.4, REQ-20.8.a, REQ-20.8.c.1, REQ-21.7.b, REQ-21.7.d.1, REQ-22.4.1, REQ-23.4.1, " +
      "REQ-24.4.1, REQ-25.4.1, REQ-31.4.2, REQ-32.4.2, REQ-36.3.3",
    sourceNote:
      "clients.court_orders (free-text array) is adjacent but not a clean yes/no — stored generically " +
      "rather than force-fit onto that column.",
  },
  {
    factId: "FACT-082",
    duplicateOf: "FACT-025",
    scope: "client",
    deferredTo: "client_record",
    question: "Is this client a DCFS/DJJYS client?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-6.4.3",
  },
  {
    factId: "FACT-043",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this contractor receive WHX/WRX maintenance payments for this client?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw:
      "REQ-20.8.a, REQ-20.8.b, REQ-20.8.c, REQ-20.8.c.2, REQ-21.7.b, REQ-21.7.c, REQ-21.7.d, REQ-21.7.d.2",
  },
  {
    factId: "FACT-044",
    scope: "client",
    deferredTo: "client_record",
    question: "Is the assigned staff or host an Immediate Relative of this client?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw:
      "REQ-11.4.3, REQ-11.4.4, REQ-20.4.3, REQ-20.4.5, REQ-21.4.1, REQ-26.4.2, REQ-36.2.1",
    sourceNote:
      "This is really a staff-client pair fact; recorded on the client until a dedicated assignment-fact UI exists.",
  },
  {
    factId: "FACT-046",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this contractor have primary responsibility for this client's medication?",
    answerType: "boolean",
    storage: {
      kind: "derived",
      description:
        "Complement of clients.self_admin_med_support — true when that flag is explicitly false.",
    },
    sourceRequirementIdsRaw:
      "REQ-1.23.c, REQ-1.23.e, REQ-16.2.4, REQ-16.2.5, REQ-17.2.4, REQ-17.2.5",
  },
  {
    factId: "FACT-074",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client self-administer their own medication?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description: "clients.self_admin_med_support already records this.",
    },
    sourceRequirementIdsRaw: "REQ-1.23.d",
  },
  {
    factId: "FACT-052",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client have a Public Housing Authority voucher?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description: "clients.housing_voucher already records this.",
    },
    sourceRequirementIdsRaw: "REQ-21.3.8, REQ-21.3.8.A, REQ-21.3.8.B, REQ-21.3.8.C",
  },
  {
    factId: "FACT-053",
    scope: "client",
    deferredTo: "client_record",
    question:
      "Is the assigned staff this client's parent, guardian, or spouse (distinguishes SLN from CMP/CMS)?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-32.4.5, REQ-32.6.a, REQ-32.6.b, REQ-32.6.c",
    sourceNote: "Same staff-client-pair ambiguity as FACT-044/FACT-060.",
  },
  {
    factId: "FACT-065",
    scope: "client",
    deferredTo: "client_record",
    question: "Has this contractor used a regularly scheduled volunteer with this client?",
    help:
      'Only regularly scheduled volunteers, matching the agency-wide "uses volunteers" question — ' +
      "not friends or natural supports the person chooses.",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-1.6.1",
    sourceNote:
      'Client-level half of a compound fact ("Does the agency use volunteers? Which clients?") — ' +
      'see COMPOUND_SPLIT_FACT_IDS and q_uses_volunteers. Previously only asserted in that ' +
      "question's sourceNote as \"deferred to the client record\" with no actual entry here — the " +
      'generated coverage table showed FACT-065 as fully answered by the agency-wide yes/no, which ' +
      "was false: that question only ever collected whether volunteers are used at all, never which " +
      "clients. This entry closes that gap for real, matching the workbook's own collection_rule for " +
      'this row ("Split compound questions into typed facts; unknown is not false").',
  },
  {
    factId: "FACT-060",
    scope: "assignment",
    deferredTo: "assignment_record",
    question:
      "Is the assigned staff a legal guardian, Immediate Relative, or grandparent of this client?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "assignment" },
    sourceRequirementIdsRaw: "REQ-2.1.2, REQ-2.1.3",
    sourceNote: 'The one workbook row that names "assignment" explicitly in its own question text.',
  },
  {
    factId: "FACT-055",
    scope: "client",
    deferredTo: "client_record",
    question:
      "What is this client's living situation (alone, with roommates, with spouse, or with relatives)?",
    answerType: "single_select",
    options: [
      { value: "alone", label: "Alone" },
      { value: "roommates", label: "With roommates" },
      { value: "spouse", label: "With spouse" },
      { value: "relatives", label: "With relatives" },
    ],
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-31.3.1, REQ-31.3.2, REQ-32.3.1",
  },
  {
    factId: "FACT-056",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client have an acquired brain injury (ABI)?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description:
        "clients.has_abi already records this and already drives the ABI-training live path.",
    },
    sourceRequirementIdsRaw: "REQ-1.8.8, REQ-36.4.2",
  },
  {
    factId: "FACT-067",
    duplicateOf: "FACT-056",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client have an ABI?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description: "Same clients.has_abi column as FACT-056.",
    },
    sourceRequirementIdsRaw: "REQ-1.8.8",
  },
  {
    factId: "FACT-059",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client's DSPD worksheet require enhanced (2:1) staffing?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description:
        'clients.staff_ratio (free text, e.g. "2:1") is adjacent but unstructured — treat as corroborating, not authoritative.',
    },
    sourceRequirementIdsRaw: "REQ-1.33.2, REQ-21.3.4",
  },
  {
    factId: "FACT-066",
    scope: "client",
    deferredTo: "client_record",
    question:
      "Is this client likely to engage in aggressive, self-injurious, or destructive behavior?",
    help: "This activates behavior-intervention training for assigned staff.",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "",
  },
  {
    factId: "FACT-068",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client have a DNR order?",
    answerType: "boolean",
    storage: {
      kind: "existing_mechanism",
      description: "clients.dnr_applicable / dnr_status already record this.",
    },
    sourceRequirementIdsRaw: "REQ-1.10.14",
  },
  {
    factId: "FACT-072",
    scope: "client",
    deferredTo: "client_record",
    question: "Was this client's discharge initiated by this contractor?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-1.22.c",
    sourceNote:
      'Workbook scopes this "agency" but it is really an event fact tied to one client\'s ' +
      "discharge, not a standing agency policy — reclassified to the client record, asked at " +
      "discharge time rather than at agency setup.",
  },
  {
    factId: "FACT-075",
    scope: "client",
    deferredTo: "client_record",
    question:
      "Does this client attend school, day services, or overnight respite with another provider?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-1.23.f",
  },
  {
    factId: "FACT-083",
    scope: "client",
    deferredTo: "client_record",
    question: "Does this client's PCSP require Employment Preparation Services (EPR)?",
    answerType: "boolean",
    storage: { kind: "generic", scope: "client" },
    sourceRequirementIdsRaw: "REQ-9.4.5",
  },
  {
    factId: "FACT-084",
    scope: "client",
    deferredTo: "client_record",
    question: "Is this client school-age?",
    answerType: "boolean",
    storage: {
      kind: "derived",
      description:
        "Derived from clients.date_of_birth against the current school year — never asked directly.",
    },
    sourceRequirementIdsRaw: "REQ-10.3.3",
  },
] as const;

const BY_FACT_ID = new Map(DEFERRED_FACTS.map((f) => [f.factId, f]));

export function deferredFact(factId: string): DeferredFactDefinition | null {
  return BY_FACT_ID.get(factId) ?? null;
}

export function deferredFactsForRecord(deferredTo: DeferredRecordKind): DeferredFactDefinition[] {
  return DEFERRED_FACTS.filter((f) => f.deferredTo === deferredTo);
}

/** Facts genuinely needing new per-record storage (public.compliance_fact_answers). */
export function deferredFactsNeedingGenericStorage(
  deferredTo: DeferredRecordKind,
): DeferredFactDefinition[] {
  return deferredFactsForRecord(deferredTo).filter((f) => f.storage.kind === "generic");
}
