// =============================================================
// NECTAR Capability Registry (Option A — declarative)
//
// Single source of truth for the curated set of actions NECTAR can offer
// against an uploaded document. The offer UI is structurally driven by this
// registry: an action is ONLY ever shown if `is_live === true` AND the
// document's detected type is in `applies_to_types`. Dormant capabilities
// stay listed (with is_live=false) so they are documented and will light up
// automatically the moment their backing flow ships — but they can never
// leak into the menu while dormant.
//
// HARD RULES:
//   - Capabilities only. No compliance opinions, no business advice.
//   - Every live action PROPOSES (drafts / pending confirm). Nothing acts
//     unilaterally on provider data.
//   - This file is the guardrail. Do NOT add ad-hoc buttons elsewhere that
//     bypass the registry.
// =============================================================

export const DETECTED_TYPES = [
  "staff_checklist",
  "scope_of_work",
  "insurance_certificate",
  "training_certificate",
  "policy_document",
  "client_intake",
  "unknown",
] as const;

export type DetectedDocType = (typeof DETECTED_TYPES)[number];

export const DETECTED_TYPE_LABELS: Record<DetectedDocType, string> = {
  staff_checklist: "staff legal/compliance checklist",
  scope_of_work: "Scope of Work / state contract",
  insurance_certificate: "insurance certificate",
  training_certificate: "training certificate",
  policy_document: "policy document",
  client_intake: "client intake paperwork",
  unknown: "document",
};

export type CapabilityAction = {
  action_key: string;
  /** Capability-phrased, doable. No advice copy. */
  label: string;
  /** Short helper line shown under the label. Still capability-only. */
  helper: string;
  applies_to_types: ReadonlyArray<DetectedDocType>;
  /** Must be true ONLY when the backing flow actually works today. */
  is_live: boolean;
  /** Identifier the offer dialog dispatches against a server fn. */
  handler:
    | "add_to_authoritative_sources"
    | "propose_staff_checklist_from_document"
    | "noop";
};

// All applicable types (used for actions that work against anything).
const ALL_TYPES = DETECTED_TYPES;

export const CAPABILITY_REGISTRY: ReadonlyArray<CapabilityAction> = [
  // ---------- LIVE ----------
  {
    action_key: "add_to_authoritative_sources",
    label: "Add this to your authoritative sources",
    helper:
      "Keeps it in the source-of-truth set the rest of HIVE reads from. You confirm the label.",
    applies_to_types: ALL_TYPES,
    is_live: true,
    handler: "add_to_authoritative_sources",
  },
  {
    action_key: "propose_staff_checklist",
    label: "Draft a trackable checklist from this for your review",
    helper:
      "NECTAR extracts items and drafts them as pending entries. Nothing goes live until you confirm.",
    applies_to_types: ["staff_checklist", "scope_of_work"],
    is_live: true,
    handler: "propose_staff_checklist_from_document",
  },

  // ---------- LIVE (HR Admin tab) ----------
  {
    action_key: "per_staff_tracking",
    label: "Open per-staff tracking for items in this checklist",
    helper:
      "Track each staff member's status against these items in the HR Admin roll-up. Completion still requires a one-click human confirm.",
    applies_to_types: ["staff_checklist"],
    is_live: true,
    handler: "noop",
  },
  {
    action_key: "renewal_alerts",
    label: "Set renewal reminders for dates found in this document",
    helper:
      "Surface upcoming expirations in the HR Admin roll-up. NECTAR pre-fills dates; you confirm them.",
    applies_to_types: [
      "insurance_certificate",
      "training_certificate",
      "staff_checklist",
    ],
    is_live: true,
    handler: "noop",
  },

  // ---------- DORMANT (documented; will appear automatically when is_live flips) ----------
  {
    action_key: "client_intake_checklist",
    label: "Open per-client intake tracking for items in this document",
    helper:
      "Track each client's intake completion against these items in the client's Intake tab. Completion still requires a one-click human confirm.",
    applies_to_types: ["client_intake", "scope_of_work"],
    is_live: true,
    handler: "noop",
  },
  {
    action_key: "sow_requirement_mapping",
    label: "Map SOW clauses to platform requirements",
    helper: "Link each clause to the requirement it drives in HIVE.",
    applies_to_types: ["scope_of_work"],
    is_live: false,
    handler: "noop",
  },
];

/** Pure filter — drives the offer menu. Never returns dormant actions. */
export function liveActionsForType(
  type: DetectedDocType,
): ReadonlyArray<CapabilityAction> {
  return CAPABILITY_REGISTRY.filter(
    (a) => a.is_live && a.applies_to_types.includes(type),
  );
}
