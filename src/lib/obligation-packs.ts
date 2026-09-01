/**
 * Pack + matrix mapping for Admin Obligations.
 *
 * Locked tabs (Onboarding / Credentials / Client) group existing
 * `company_obligations` rows by title. Custom tabs are provider rows
 * tagged with due_day_config.hive_pack_key (and pack_key once the
 * additive migration is applied). No parallel obligation system.
 */

import { AGENCY_POLICY_SOURCE_SECTION } from "./agency-policies.ts";
import {
  CLIENT_SPECIFIC_OBLIGATION_TITLE,
  PCT_CLIENT_OBLIGATION_TITLE,
  PCT_HIRE_COURSE_TITLE,
  SUPPORT_STRATEGIES_OBLIGATION_TITLE,
  clientFormKindForTitle,
} from "./client-form-obligations.ts";
import { ABI_OBLIGATION_TITLE, THIRTY_DAY_OBLIGATION_TITLE } from "./in-hive-training.ts";
import { CODE_OF_CONDUCT_TITLE, CONFLICT_OF_INTEREST_TITLE } from "./obligation-auto-assign.ts";
import { CPR_OBLIGATION_TITLES, MANDT_OBLIGATION_TITLES } from "./training-class.ts";

export const LOCKED_PACK_KEYS = ["onboarding", "credentials", "client"] as const;
export type LockedPackKey = (typeof LOCKED_PACK_KEYS)[number];

export const LOCKED_PACK_LABEL: Record<LockedPackKey, string> = {
  onboarding: "Onboarding",
  credentials: "Credentials",
  client: "Client",
};

export const HIVE_PACK_KEY_FIELD = "hive_pack_key";
export const HIVE_PACK_NAME_FIELD = "hive_pack_name";
export const HIVE_PACK_SENTINEL_FIELD = "hive_pack_sentinel";
export const HIVE_IS_REQUIRED_FIELD = "hive_is_required";
export const HIVE_PACK_ASSIGN_FIELD = "hive_pack_assign";

export type PackAssignSpec = {
  roles: string[];
  jobCodes: string[];
  groupIds: string[];
  userIds: string[];
};

export type ObligationPackRef = {
  packKey: string;
  columnKey: string;
  label: string;
  required: boolean;
  lockedPack: boolean;
};

type PackableObligation = {
  id: string;
  title: string;
  source?: string | null;
  source_policy_section?: string | null;
  scope?: string | null;
  agency_policy_id?: string | null;
  pack_key?: string | null;
  is_required?: boolean | null;
  due_day_config?: unknown;
  active?: boolean | null;
};

export function readDueDayConfig(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function isPackSentinel(ob: PackableObligation): boolean {
  return readDueDayConfig(ob.due_day_config)[HIVE_PACK_SENTINEL_FIELD] === true;
}

export function customPackKeyFromConfig(raw: unknown): string | null {
  const cfg = readDueDayConfig(raw);
  const key = cfg[HIVE_PACK_KEY_FIELD];
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

export function customPackNameFromConfig(raw: unknown): string | null {
  const cfg = readDueDayConfig(raw);
  const name = cfg[HIVE_PACK_NAME_FIELD];
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function titleEq(title: string, expected: string): boolean {
  return title.trim().toLowerCase() === expected.trim().toLowerCase();
}

function titleStarts(title: string, prefix: string): boolean {
  return title.trim().toLowerCase().startsWith(prefix.trim().toLowerCase());
}

function inTitleList(title: string, list: readonly string[]): boolean {
  return list.some((t) => titleEq(title, t));
}

/** CPR initial + renewal share one Credentials column. */
export function isCprObligationTitle(title: string): boolean {
  if (inTitleList(title, CPR_OBLIGATION_TITLES)) return true;
  return /^cpr(\/|&|\s)?.*first aid/i.test(title.trim());
}

export function isMandtObligationTitle(title: string): boolean {
  return inTitleList(title, MANDT_OBLIGATION_TITLES) || /^behavior intervention/i.test(title.trim());
}

export function isAbiObligationTitle(title: string): boolean {
  return titleEq(title, ABI_OBLIGATION_TITLE) || titleStarts(title, "ABI Training");
}

function isAgencyPolicyObligation(ob: PackableObligation): boolean {
  if (ob.agency_policy_id) return true;
  const section = (ob.source_policy_section ?? "").trim();
  return section === AGENCY_POLICY_SOURCE_SECTION || /contractor.s own policies/i.test(section);
}

function configRequiredOverride(ob: PackableObligation): boolean | null {
  if (typeof ob.is_required === "boolean") return ob.is_required;
  const flag = readDueDayConfig(ob.due_day_config)[HIVE_IS_REQUIRED_FIELD];
  if (typeof flag === "boolean") return flag;
  return null;
}

/**
 * Optional items never alarm: no red cell, no overdue increment, no clock-in block.
 * Locked SOW staff items are required when assigned. Provider items default required
 * unless the admin marked them optional (W-9-style uploads).
 */
export function obligationIsRequired(ob: PackableObligation): boolean {
  if (isPackSentinel(ob)) return false;
  const override = configRequiredOverride(ob);
  if (override !== null) return override;
  return true;
}

function lockedOnboarding(title: string): ObligationPackRef | null {
  if (titleEq(title, CODE_OF_CONDUCT_TITLE)) {
    return {
      packKey: "onboarding",
      columnKey: "code-of-conduct",
      label: "Code of Conduct",
      required: true,
      lockedPack: true,
    };
  }
  if (titleEq(title, CONFLICT_OF_INTEREST_TITLE)) {
    return {
      packKey: "onboarding",
      columnKey: "conflict-of-interest",
      label: "Conflict of Interest",
      required: true,
      lockedPack: true,
    };
  }
  if (titleEq(title, "Educational Credentials and Licenses — On File")) {
    return {
      packKey: "onboarding",
      columnKey: "educational-credentials",
      label: "Credentials on file",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Driving Record")) {
    return {
      packKey: "onboarding",
      columnKey: "driving-record",
      label: "Driving record",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Medicaid Disclosure Form")) {
    return {
      packKey: "onboarding",
      columnKey: "medicaid-disclosure",
      label: "Medicaid Disclosure",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Background Screening")) {
    return {
      packKey: "onboarding",
      columnKey: "background-screening",
      label: "Background screening",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Medicaid Fraud")) {
    return {
      packKey: "onboarding",
      columnKey: "medicaid-exclusion",
      label: "Exclusion screening",
      required: true,
      lockedPack: true,
    };
  }
  if (/handbook|photo.?id|driver.?s? license|i-?9|w-?4|w-?9/i.test(title)) {
    const optionalTaxForm = /\b(w-?9|i-?9)\b/i.test(title);
    return {
      packKey: "onboarding",
      columnKey: `onboard:${title.trim().toLowerCase()}`,
      label: shortLabel(title),
      required: !optionalTaxForm,
      lockedPack: true,
    };
  }
  return null;
}

function lockedCredentials(title: string): ObligationPackRef | null {
  if (titleEq(title, THIRTY_DAY_OBLIGATION_TITLE)) {
    return {
      packKey: "credentials",
      columnKey: "thirty-day",
      label: "30-day orientation",
      required: true,
      lockedPack: true,
    };
  }
  if (isCprObligationTitle(title)) {
    return {
      packKey: "credentials",
      columnKey: "cpr",
      label: "CPR / First Aid",
      required: true,
      lockedPack: true,
    };
  }
  if (isMandtObligationTitle(title)) {
    return {
      packKey: "credentials",
      columnKey: "mandt",
      label: "Mandt / BI cert",
      required: true,
      lockedPack: true,
    };
  }
  if (isAbiObligationTitle(title)) {
    return {
      packKey: "credentials",
      columnKey: "abi",
      label: "ABI training",
      required: true,
      lockedPack: true,
    };
  }
  if (titleEq(title, PCT_HIRE_COURSE_TITLE) || titleStarts(title, "Person-Centered Thinking and Practices")) {
    return {
      packKey: "credentials",
      columnKey: "pct-hire",
      label: "PCT practices",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Annual 12-Hour") || titleStarts(title, "Annual 12 Hour")) {
    return {
      packKey: "credentials",
      columnKey: "annual-ce",
      label: "Annual CE",
      required: true,
      lockedPack: true,
    };
  }
  if (titleEq(title, "Annual Emergency Management Plan Training")) {
    return {
      packKey: "credentials",
      columnKey: "emp-training",
      label: "Emergency plan training",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "ACRE Training") || titleStarts(title, "Customized Employment")) {
    return {
      packKey: "credentials",
      columnKey: `acre:${title.trim().toLowerCase()}`,
      label: shortLabel(title),
      required: true,
      lockedPack: true,
    };
  }
  return null;
}

function lockedClient(title: string): ObligationPackRef | null {
  const kind = clientFormKindForTitle(title);
  if (kind === "person_specific" || titleStarts(title, "Client-Specific Training")) {
    return {
      packKey: "client",
      columnKey: "client-specific",
      label: "Client-specific training",
      required: true,
      lockedPack: true,
    };
  }
  if (kind === "support_strategies" || titleEq(title, SUPPORT_STRATEGIES_OBLIGATION_TITLE)) {
    return {
      packKey: "client",
      columnKey: "support-strategies",
      label: "Support strategies",
      required: true,
      lockedPack: true,
    };
  }
  if (kind === "person_centered" || titleEq(title, PCT_CLIENT_OBLIGATION_TITLE)) {
    return {
      packKey: "client",
      columnKey: "pct-client",
      label: "Person-centered thinking",
      required: true,
      lockedPack: true,
    };
  }
  if (titleStarts(title, "Housemate Informed-Choice")) {
    return {
      packKey: "client",
      columnKey: "housemate-choice",
      label: "Housemate informed choice",
      required: true,
      lockedPack: true,
    };
  }
  if (/host.?home agr/i.test(title)) {
    return {
      packKey: "client",
      columnKey: "host-home-agreement",
      label: "Host-home agreement",
      required: false,
      lockedPack: true,
    };
  }
  return null;
}

function shortLabel(title: string): string {
  return title.replace(/\s+[—-]\s+\[Client Name\]/i, "").trim();
}

/**
 * Where this obligation appears on the admin pack grid.
 * Org-level contractor filings stay off the staff matrix.
 */
export function packColumnForObligation(ob: PackableObligation): ObligationPackRef | null {
  if (isPackSentinel(ob)) return null;
  const title = (ob.title ?? "").trim();
  if (!title) return null;

  const storedKey = (typeof ob.pack_key === "string" && ob.pack_key.trim()
    ? ob.pack_key.trim()
    : null) ?? customPackKeyFromConfig(ob.due_day_config);

  if (storedKey && !LOCKED_PACK_KEYS.includes(storedKey as LockedPackKey)) {
    return {
      packKey: storedKey,
      columnKey: `custom:${ob.id}`,
      label: shortLabel(title),
      required: obligationIsRequired(ob),
      lockedPack: false,
    };
  }

  if (isAgencyPolicyObligation(ob)) {
    return {
      packKey: storedKey && LOCKED_PACK_KEYS.includes(storedKey as LockedPackKey) ? storedKey : "onboarding",
      columnKey: `policy:${ob.id}`,
      label: shortLabel(title),
      required: obligationIsRequired(ob),
      lockedPack: true,
    };
  }

  const onboard = lockedOnboarding(title);
  if (onboard) {
    return { ...onboard, required: configRequiredOverride(ob) ?? onboard.required };
  }
  const creds = lockedCredentials(title);
  if (creds) {
    return { ...creds, required: configRequiredOverride(ob) ?? creds.required };
  }
  const client = lockedClient(title);
  if (client) {
    return { ...client, required: configRequiredOverride(ob) ?? client.required };
  }

  if (storedKey && LOCKED_PACK_KEYS.includes(storedKey as LockedPackKey)) {
    return {
      packKey: storedKey,
      columnKey: `mapped:${ob.id}`,
      label: shortLabel(title),
      required: obligationIsRequired(ob),
      lockedPack: true,
    };
  }

  // Leftover staff-facing items land on Credentials so no default tab is empty
  // after inventory, and we never invent a second tracker.
  if (ob.scope === "staff" || ob.scope === "staff_per_client") {
    return {
      packKey: "credentials",
      columnKey: `leftover:${ob.id}`,
      label: shortLabel(title),
      required: obligationIsRequired(ob),
      lockedPack: true,
    };
  }

  return null;
}

export function isLockedPackKey(key: string): key is LockedPackKey {
  return (LOCKED_PACK_KEYS as readonly string[]).includes(key);
}

export function staffInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export type PackCellStatus = "complete" | "incomplete" | "optional_empty" | "unassigned";

export function packCellStatus(args: {
  assigned: boolean;
  complete: boolean;
  required: boolean;
}): PackCellStatus {
  if (!args.assigned) return "unassigned";
  if (args.complete) return "complete";
  if (!args.required) return "optional_empty";
  return "incomplete";
}

/** Red counts ignore optional empties and unassigned cells. */
export function cellIncrementsRed(status: PackCellStatus): boolean {
  return status === "incomplete";
}

export function mergeDueDayPackFields(
  existing: unknown,
  fields: {
    packKey?: string | null;
    packName?: string | null;
    isRequired?: boolean | null;
    sentinel?: boolean;
    assign?: PackAssignSpec | null;
  },
): Record<string, unknown> {
  const next = { ...readDueDayConfig(existing) };
  if (fields.packKey !== undefined) {
    if (fields.packKey) next[HIVE_PACK_KEY_FIELD] = fields.packKey;
    else delete next[HIVE_PACK_KEY_FIELD];
  }
  if (fields.packName !== undefined) {
    if (fields.packName) next[HIVE_PACK_NAME_FIELD] = fields.packName;
    else delete next[HIVE_PACK_NAME_FIELD];
  }
  if (fields.isRequired !== undefined) {
    if (typeof fields.isRequired === "boolean") next[HIVE_IS_REQUIRED_FIELD] = fields.isRequired;
    else delete next[HIVE_IS_REQUIRED_FIELD];
  }
  if (fields.sentinel === true) next[HIVE_PACK_SENTINEL_FIELD] = true;
  if (fields.assign !== undefined) {
    if (fields.assign) next[HIVE_PACK_ASSIGN_FIELD] = fields.assign;
    else delete next[HIVE_PACK_ASSIGN_FIELD];
  }
  return next;
}

export function newCustomPackKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `custom-${crypto.randomUUID()}`;
  }
  return `custom-${Date.now().toString(36)}`;
}

/** Client-form catalog titles used to keep the Client tab live. */
export const CLIENT_PACK_SEED_TITLES = [
  CLIENT_SPECIFIC_OBLIGATION_TITLE,
  SUPPORT_STRATEGIES_OBLIGATION_TITLE,
  PCT_CLIENT_OBLIGATION_TITLE,
] as const;
