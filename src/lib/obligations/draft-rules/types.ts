/**
 * In-app draft rule model for DHHS91172 workbook Stage 1.
 * Lifecycle is encoded here. Stage 1 fixtures stay draft / not_published.
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
] as const;
export type PredicateKind = (typeof PREDICATE_KINDS)[number];

/** Explicit anchors only. Never invent annual-from-completion. */
export type TimingAnchor =
  | { kind: "hire_plus_days"; days: number }
  | { kind: "employment_year"; startYear: number }
  | { kind: "certificate_expiry"; certKey: string }
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
};

export type CompletionGroup = {
  logic: GroupLogic;
  /** orientation 1.8(4) = one parent assignment; never one-task-per-topic. */
  parentAssignment: "one" | "per_member";
  members: GroupMember[];
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
  approval: ApprovalRecord | null;
};

export const STAGE1_ACTIVATION_LOCKED = true;
