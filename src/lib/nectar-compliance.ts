/**
 * Shim — existing imports keep working.
 * Split: stop-writes, detectors, stubs, and the remaining read/check fns.
 */
export {
  listComplianceRules,
  proposeComplianceRule,
  updateComplianceRule,
  listRuleHistory,
  checkBillingEntry,
  raiseComplianceFlag,
  resolveComplianceFlag,
  listComplianceFlags,
  checkStaffPrerequisite,
  draftStaffPrerequisiteRules,
} from "./nectar-compliance.functions";

export {
  complianceDetectors,
  detectionTypeFor,
} from "./nectar-compliance.detectors";
export type { ComplianceDetectorKey } from "./nectar-compliance.detectors";

export { checkDeadline, checkActivity } from "./nectar-compliance-stubs.functions";

export {
  NECTAR_COMPLIANCE_WRITES_RETIRED,
  skipNectarComplianceMutation,
  skipNectarComplianceWrite,
} from "./nectar-compliance/stop-writes";
