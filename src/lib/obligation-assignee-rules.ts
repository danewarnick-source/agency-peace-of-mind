// Duty-specific assignee narrowing. Decisions use company_obligations.key
// (catalog key). Title lookup is only for resolving a missing key.

import { dutyKeyForObligation } from "./obligations/duty-applicability.ts";

export function dutyRequiresTransporter(key: string | null | undefined): boolean {
  return key === "driving_record_transport";
}

export function dutyRequiresBehaviorCaseload(key: string | null | undefined): boolean {
  return key === "behavior_intervention_cert";
}

export function dutyRequiresAbiCaseload(key: string | null | undefined): boolean {
  return key === "abi_training";
}

/** Org-level duties that must generate one instance per home, not one for the agency. */
export function perHomeServiceCode(key: string | null | undefined): string | null {
  if (key === "hhs_home_cert_annual" || key === "hhs_evac_drills_quarterly") return "HHS";
  if (key === "rhs_evac_drills_quarterly") return "RHS";
  if (key === "pps_evac_drills_quarterly") return "PPS";
  return null;
}

export function homePeriodKey(teamName: string, teamId: string, catalogPeriodKey: string): string {
  return `${teamName} [${teamId.slice(0, 8)}] — ${catalogPeriodKey}`;
}

export function obligationDutyKey(ob: { key?: string | null; title?: string | null }): string | null {
  return dutyKeyForObligation(ob);
}
