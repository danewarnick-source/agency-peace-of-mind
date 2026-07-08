// Attestation framework: scales the required attestation by administration
// model + med risk-class. Consumed by both the server-side enforcement in
// logMedicationPass and the client shift-tap UI so the two never diverge.
//
// - "light"  : one-tap affirmation (who + confirm). Routine observation.
// - "full"   : signature required. Hands-on administration, controlled or
//              rescue meds — same discipline as the current self-admin flow.
// - "witness": signature + second witness required. Reserved for controlled-
//              substance hands-on administration where policy requires it.

export type AdministratorRole =
  | "self"
  | "staff_observed"
  | "staff_administered"
  | "lpn"
  | "rn"
  | "delegated";

export type AttestationLevel = "light" | "full" | "witness";

export interface MedRiskFlags {
  is_controlled?: boolean | null;
  is_rescue?: boolean | null;
  is_prn?: boolean | null;
}

/** Roles that are hands-on (staff physically administers the medication). */
export const HANDS_ON_ROLES: AdministratorRole[] = [
  "staff_administered",
  "lpn",
  "rn",
  "delegated",
];

export function isHandsOnRole(role: AdministratorRole | null | undefined): boolean {
  return !!role && HANDS_ON_ROLES.includes(role);
}

/**
 * Compute the required attestation level for a given administration.
 * Highest wins. Kept pure so both server and client can call it.
 */
export function requiredAttestation(
  role: AdministratorRole,
  med: MedRiskFlags,
): AttestationLevel {
  // Controlled hands-on always requires a witness signature per policy.
  if (isHandsOnRole(role) && med.is_controlled) return "witness";
  // Any hands-on OR rescue OR controlled self-admin → full signature.
  if (isHandsOnRole(role) || med.is_rescue || med.is_controlled) return "full";
  // Self-directed self-administration currently uses full attestation
  // (existing behavior). Observation-only tap is lightweight.
  if (role === "staff_observed") return "light";
  return "full";
}

/** Human-readable label for UI display. */
export const ROLE_LABEL: Record<AdministratorRole, string> = {
  self: "Self-administered",
  staff_observed: "Observed self-administration",
  staff_administered: "Staff-administered",
  lpn: "LPN-administered",
  rn: "RN-administered",
  delegated: "Delegated administration",
};
