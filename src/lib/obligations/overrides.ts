// Duty overrides on existing compliance_overrides rows.
// Insert-only. Never completes the underlying instance or remediation plan.

import { sowCatalogEntry } from "../sow-obligation-catalog.ts";
import { isBlocksSoloWhenLapsedKey, overrideIsActive } from "./solo-lapse.ts";

export const OVERRIDE_SCOPES = ["instance", "staff_clock", "shift"] as const;
export type OverrideScope = (typeof OVERRIDE_SCOPES)[number];

export const OVERRIDE_STATE_LABEL = "Overridden";
export const OVERRIDE_STILL_REQUIRED = "Override on file. The requirement is not complete.";
export const NONWAIVABLE_REJECT = "This requirement cannot be overridden.";

/** Catalog has no nonwaivable column — conservative allowlist only. */
export function dutyKeyFromObligation(ob: {
  key?: string | null;
  title?: string | null;
}): string | null {
  if (ob.key) return ob.key;
  if (!ob.title) return null;
  return sowCatalogEntry(ob.title)?.key ?? null;
}

export function isWaivableObligationKey(key: string | null | undefined): boolean {
  return isBlocksSoloWhenLapsedKey(key);
}

export function assertWaivableObligationKey(key: string | null | undefined): string {
  if (!key || !isWaivableObligationKey(key)) {
    throw new Error(NONWAIVABLE_REJECT);
  }
  return key;
}

export function parseOverrideScope(value: string | null | undefined): OverrideScope | null {
  if (value === "instance" || value === "staff_clock" || value === "shift") return value;
  if (value === "solo_lapse") return "staff_clock";
  return null;
}

export function requireFutureExpiresAt(expiresAt: string, now: Date = new Date()): string {
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) throw new Error("Override expiration is required.");
  if (t <= now.getTime()) throw new Error("Override expiration must be in the future.");
  return new Date(t).toISOString();
}

export type OverrideRow = {
  id: string;
  organization_id: string;
  staff_id: string;
  obligation_id: string | null;
  instance_id: string | null;
  obligation_key: string | null;
  gap_key: string | null;
  gap_type: string | null;
  kind: string | null;
  reason: string;
  expires_at: string | null;
  created_by: string | null;
  created_at: string | null;
  shift_id: string | null;
  authorized_by?: string | null;
  active?: boolean;
};

export type OverrideTarget = {
  instanceId?: string | null;
  obligationId?: string | null;
  obligationKey?: string | null;
  staffId?: string | null;
  shiftId?: string | null;
};

export function overrideAppliesToTarget(row: OverrideRow, target: OverrideTarget): boolean {
  if (target.staffId && row.staff_id && row.staff_id !== target.staffId) return false;
  if (row.instance_id && target.instanceId && row.instance_id === target.instanceId) return true;
  if (row.shift_id && target.shiftId && row.shift_id === target.shiftId) return true;
  const rowKey = row.obligation_key ?? row.gap_key;
  if (rowKey && target.obligationKey && rowKey === target.obligationKey) return true;
  if (row.obligation_id && target.obligationId && row.obligation_id === target.obligationId) {
    return true;
  }
  return false;
}

export function selectActiveOverride(
  rows: OverrideRow[],
  now: Date = new Date(),
): OverrideRow | null {
  const active = rows.filter((r) => overrideIsActive(r.expires_at, now));
  if (!active.length) return null;
  return (
    [...active].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null
  );
}

export function auditOverrideHistory(rows: OverrideRow[]): OverrideRow[] {
  return [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

export function overrideLeavesRequirementOpen(instanceStatus: string): boolean {
  return instanceStatus !== "completed" && instanceStatus !== "waived";
}

export type OverrideInsertInput = {
  organizationId: string;
  staffId: string;
  obligationKey: string;
  obligationId?: string | null;
  instanceId?: string | null;
  shiftId?: string | null;
  scope: OverrideScope;
  reason: string;
  expiresAt: string;
  createdBy: string;
  now?: Date;
};

export function buildOverrideInsert(input: OverrideInsertInput): {
  organization_id: string;
  staff_id: string;
  gap_type: OverrideScope;
  gap_reference_date: string;
  gap_key: string;
  obligation_key: string;
  obligation_id: string | null;
  instance_id: string | null;
  kind: "solo_lapse";
  shift_id: string | null;
  reason: string;
  expires_at: string;
  created_by: string;
} {
  const key = assertWaivableObligationKey(input.obligationKey);
  const expires = requireFutureExpiresAt(input.expiresAt, input.now ?? new Date());
  const reason = input.reason.trim();
  if (reason.length < 8) throw new Error("Override reason must be at least 8 characters.");
  if (!input.createdBy) throw new Error("Override authority is required.");
  if (!input.staffId) throw new Error("Override scope requires a staff member.");
  const today = (input.now ?? new Date()).toISOString().slice(0, 10);
  return {
    organization_id: input.organizationId,
    staff_id: input.staffId,
    gap_type: input.scope,
    gap_reference_date: today,
    gap_key: key,
    obligation_key: key,
    obligation_id: input.obligationId ?? null,
    instance_id: input.instanceId ?? null,
    kind: "solo_lapse",
    shift_id: input.shiftId ?? null,
    reason,
    expires_at: expires,
    created_by: input.createdBy,
  };
}

export function activeOverrideForTarget(
  rows: OverrideRow[],
  target: OverrideTarget,
  now: Date = new Date(),
): OverrideRow | null {
  return selectActiveOverride(
    rows.filter((row) => overrideAppliesToTarget(row, target)),
    now,
  );
}

export function overrideUntilLabel(expiresAt: string | null | undefined): string | null {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export { overrideIsActive };
