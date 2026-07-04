/**
 * Executive Command Center capability keys.
 *
 * Today only one exec role exists (`executive`) and it holds every capability.
 * Adding a scoped exec role in the future is a matter of extending
 * `EXECUTIVE_ROLE_CAPABILITIES` — no rewrites required at the call sites.
 */

export const EXEC_CAPABILITIES = [
  "companies.read",
  "companies.write",
  "billing.approve",
  "extraction.approve",
  "upgrades.manage",
  "features.manage",
  "states.edit",
  "roles.manage",
  "agreements.read",
  "agreements.manage",
  "health.read",
  "support.manage",
  "steve.use",
  "knowledge.manage",
] as const;

export type ExecCapability = (typeof EXEC_CAPABILITIES)[number];

export type ExecRole = "executive";

export const EXECUTIVE_ROLE_CAPABILITIES: Record<ExecRole, ExecCapability[]> = {
  executive: [...EXEC_CAPABILITIES],
};

export function capabilitiesForRole(role: ExecRole | null | undefined): ExecCapability[] {
  if (!role) return [];
  return EXECUTIVE_ROLE_CAPABILITIES[role] ?? [];
}
