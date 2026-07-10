/**
 * client-staff-visibility.ts — shared visibility model
 *
 * Two-level filter that decides what a staff-facing surface may see
 * about a client:
 *
 *   1. SECTION toggle (hard override). One switch per section — if off,
 *      nothing in that section reaches staff, no per-field override.
 *   2. FIELD toggle. Inside a section that is on, each individual field
 *      (fixed identity field, PCSP goal, medication, authorized code,
 *      custom field) can be individually hidden. Missing key = visible.
 *
 * Section defaults:
 *   identity, care_plan, operations → ON
 *   billing, files, compliance      → OFF
 *
 * Field key format: `"<section>.<kind>:<id>"` where kind is one of
 *   field | goal | medication | code | custom
 * Fixed identity fields use `identity.field:<column-name>`.
 * A missing key means visible; explicit `false` means hidden.
 */

export const SECTION_NAMES = [
  "identity",
  "care_plan",
  "billing",
  "files",
  "operations",
  "compliance",
] as const;

export type SectionName = (typeof SECTION_NAMES)[number];

export const SECTION_DEFAULTS: Record<SectionName, boolean> = {
  identity: true,
  care_plan: true,
  operations: true,
  billing: false,
  files: false,
  compliance: false,
};

export const SECTION_LABEL: Record<SectionName, string> = {
  identity: "Identity",
  care_plan: "Care plan",
  billing: "Billing",
  files: "Files",
  operations: "Operations",
  compliance: "Compliance",
};

export type SectionMap = Partial<Record<SectionName, boolean>>;
export type FieldMap = Record<string, boolean>;

export type ClientVisibilityRow = {
  sections: SectionMap;
  fields: FieldMap;
};

/** Fixed identity fields that admins may toggle. Name/DOB stay always-on. */
export const IDENTITY_TOGGLEABLE_FIELDS = [
  "admission_date",
  "medicaid_id",
  "guardian",
  "emergency_contacts",
  "support_coordinator",
] as const;

export function sectionKey(section: SectionName): SectionName {
  return section;
}

export function fieldKey(
  section: SectionName,
  kind: "field" | "goal" | "medication" | "code" | "custom",
  id: string,
): string {
  return `${section}.${kind}:${id}`;
}

export function isSectionVisible(
  row: ClientVisibilityRow | null | undefined,
  section: SectionName,
): boolean {
  const v = row?.sections?.[section];
  return typeof v === "boolean" ? v : SECTION_DEFAULTS[section];
}

export function isFieldVisible(
  row: ClientVisibilityRow | null | undefined,
  key: string,
): boolean {
  return row?.fields?.[key] !== false;
}
