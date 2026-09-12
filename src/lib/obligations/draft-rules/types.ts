/**
 * In-app draft rule model for DHHS91172 workbook Stages 1–5.
 * Lifecycle is encoded here. Fixtures and catalog rows stay draft / not_published.
 * No live activation. No invented renewal intervals.
 */

export const RULE_LIFECYCLES = ["draft", "reviewed", "published", "superseded"] as const;
export type RuleLifecycle = (typeof RULE_LIFECYCLES)[number];

export const PUBLICATION_FLAGS = ["not_published", "published"] as const;
export type PublicationFlag = (typeof PUBLICATION_FLAGS)[number];

export const COMPLETION_ROUTES = ["IN_PLATFORM", "UPLOAD", "EXTERNAL", "SYSTEM"] as const;
export type CompletionRoute = (typeof COMPLETION_ROUTES)[number];

export const GROUP_LOGICS = ["ALL", "ANY", "CONDITIONAL"] as const;
export type GroupLogic = (typeof GROUP_LOGICS)[number];

export const RULE_TEST_KINDS = ["positive", "negative", "boundary"] as const;
export type RuleTestKind = (typeof RULE_TEST_KINDS)[number];

export const PREDICATE_KINDS = [
  "direct_support_assignment",
  "abi_caseload",
  "sei_assignment",
  "org_acre_coverage",
  "staff_acre_supervisor",
  "behavior_risk_assignment",
  "designated_benefits_staff",
  "usor_sei_vendor",
  "cmp_cms_assignment",
  "sjd_assignment",
  "periodic_report",
  "service_documentation",
  "payroll_timesheet",
  "evv_mandated",
  "signature_attestation",
  "billing_restriction",
  "pba_assignment",
  "product_default_reminder",
  "change_impact",
  "audit_export",
] as const;
export type PredicateKind = (typeof PREDICATE_KINDS)[number];

export const MEMBER_CONDITIONS = [
  "newly_arising_risk",
  "sjd_discovery",
  "monthly_summary_codes",
  "quarterly_summary_codes",
  "quarter_hour_code",
  "hhs_daily_note",
  "evv_mandated_code",
] as const;
export type MemberCondition = (typeof MEMBER_CONDITIONS)[number];

/** Evidence / documentation lifecycle. Upload → submitted. Only accepted changes compliance. */
export const EVIDENCE_LIFECYCLES = [
  "not_started",
  "in_progress",
  "submitted",
  "needs_correction",
  "accepted",
  "expired",
  "superseded",
] as const;
export type EvidenceLifecycle = (typeof EVIDENCE_LIFECYCLES)[number];

export const NOTE_FIELD_REQUIREMENTS = ["ALL", "CONDITIONAL"] as const;
export type NoteFieldRequirement = (typeof NOTE_FIELD_REQUIREMENTS)[number];

export const INDEPENDENT_DOC_LANES = [
  "evv",
  "payroll_timesheet",
  "signature",
  "reporting",
] as const;
export type IndependentDocLane = (typeof INDEPENDENT_DOC_LANES)[number];

export type NoteFieldSpec = {
  id: string;
  label: string;
  requirement: NoteFieldRequirement;
  /** CONDITIONAL only — skipped when the source condition is known false. */
  condition?: MemberCondition;
};

export type ServiceNoteTemplate = {
  id: string;
  label: string;
  /** Empty = general schema. Non-empty = explicit service-specific override. */
  serviceCodes: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  fields: NoteFieldSpec[];
  sourceClauseId: string;
};

/** How a reusable evidence record may satisfy a group member. */
export type EvidenceMatchSpec = {
  scope: string;
  requiredCoverage?: string[];
  issuer?: string;
};

/** Explicit anchors only. Never invent annual-from-completion. */
export type TimingAnchor =
  | { kind: "hire_plus_days"; days: number }
  | { kind: "employment_year"; startYear: number }
  | { kind: "certificate_expiry"; certKey: string }
  | {
      kind: "usor_cohort";
      cutover: string;
      existingDeadline: string;
      awardPlusMonths: number;
    }
  | { kind: "calendar_period"; cadence: "monthly" | "quarterly" }
  | { kind: "none"; reason: string };

export type DraftPredicate = {
  kind: PredicateKind;
  /** Existing pack key when the predicate reuses duty applicability. */
  catalogKey: string | null;
};

export type GroupMember = {
  id: string;
  label: string;
  sourceClauseId: string;
  catalogKey: string | null;
  topicCode?: string;
  timing?: TimingAnchor;
  completionRoutes: CompletionRoute[];
  /** CONDITIONAL member — skipped when the condition is known false. */
  condition?: MemberCondition;
  /** Official named program / credential. A generic quiz is not a substitute. */
  requiresOfficialProgram?: boolean;
  /** Optional reuse match — one accepted record may satisfy several members/rules. */
  evidenceMatch?: {
    scope: string;
    requiredCoverage?: string[];
    issuer?: string;
  };
};

/** ANY-of-routes. The selected route must satisfy ALL of its conditions. */
export type NestedRoute = {
  id: string;
  label: string;
  sourceClauseId: string;
  officialProgram: string;
  requiresDspdWrittenApproval?: boolean;
  completionRoutes: CompletionRoute[];
  conditions: GroupMember[];
};

export type CompletionGroup = {
  logic: GroupLogic;
  /** orientation 1.8(4) = one parent assignment; never one-task-per-topic. */
  parentAssignment: "one" | "per_member";
  members: GroupMember[];
  /** Nested ANY routes (1.8.6). Selected route must satisfy ALL conditions. */
  routes?: NestedRoute[];
  routeLogic?: "ANY";
  conditionNote?: string;
};

export type EvidenceAcceptance = {
  summary: string;
  routes: CompletionRoute[];
  /** Descriptive handling label — not automatic equivalency. */
  defaultHandlingLabel: string;
  automaticEquivalency: false;
};

export type DraftRuleTest = {
  id: string;
  kind: RuleTestKind;
  assert: string;
};

export type RuleSourceLink = {
  sourceId: string;
  sourceVersion: string;
  sourceHash: string;
  clauseIds: string[];
};

/** Source_index labels are ARCHIVE METADATA, not publication permission. */
export type SourceIndexMeta = {
  label: string;
  isPublicationPermission: false;
};

export type ApprovalRecord = {
  actorId: string;
  actorLabel: string;
  approvedAt: string;
};

export type DraftRule = {
  id: string;
  version: number;
  title: string;
  catalogKeys: string[];
  lifecycle: RuleLifecycle;
  publication: PublicationFlag;
  source: RuleSourceLink;
  sourceIndex: SourceIndexMeta;
  predicates: DraftPredicate[];
  group: CompletionGroup;
  timing: TimingAnchor;
  evidence: EvidenceAcceptance;
  completionRoutes: CompletionRoute[];
  tests: DraftRuleTest[];
  unresolvedAlternatives: string[];
  unresolvedRenewals: string[];
  /** Known workbook publication gaps. Do not invent the missing legal fact. */
  releaseGaps: string[];
  /** Workbook publication_gap cell. When set, canPublish is false. */
  publicationGap: string | null;
  approval: ApprovalRecord | null;
};

/** Activation stays locked for every draft fixture and catalog row (Stages 1–5). */
export const STAGE1_ACTIVATION_LOCKED = true;
