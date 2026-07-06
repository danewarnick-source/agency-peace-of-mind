/**
 * Detector registry — the plug-in seam for the compliance-flag engine.
 *
 * Each detector is a `createServerFn` that reads confirmed rules of its type
 * (plus any surface-provided context), returns CandidateFlag[] in the shape
 * the reusable <ComplianceFlagDialog> and useComplianceGate expect, and
 * mutates nothing.
 *
 * Add a new detection type = add one server fn + one entry here.
 * Surfaces never import individual detectors; they pass a registry key to
 * useComplianceGate.
 */
import { checkBillingEntry, checkStaffPrerequisite } from "./nectar-compliance.functions";
import { checkDeadline, checkActivity } from "./nectar-compliance-stubs.functions";

export const complianceDetectors = {
  billing: checkBillingEntry,
  staffPrereq: checkStaffPrerequisite,
  deadline: checkDeadline,
  activity: checkActivity,
} as const;

export type ComplianceDetectorKey = keyof typeof complianceDetectors;

export const detectionTypeFor: Record<ComplianceDetectorKey, "billing_conflict" | "staff_prerequisite" | "deadline" | "activity"> = {
  billing: "billing_conflict",
  staffPrereq: "staff_prerequisite",
  deadline: "deadline",
  activity: "activity",
};
