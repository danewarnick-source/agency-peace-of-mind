import {
  ALL_PERMISSIONS,
  DEFAULT_MATRIX,
  PERMISSION_SECTION_MAP,
  type Permission,
} from "./rbac.ts";

export const PROFILE_PERMISSION_GROUP_KEYS = [
  "people_files",
  "schedule_money",
  "staff_phone",
] as const;

export type ProfilePermissionGroupKey = (typeof PROFILE_PERMISSION_GROUP_KEYS)[number];

export type ProfilePermissionGroup = {
  key: ProfilePermissionGroupKey;
  label: string;
  permissions: Permission[];
};

const STAFF_PHONE = new Set<Permission>(DEFAULT_MATRIX.employee);
const SCHEDULE_MONEY_SECTIONS = new Set(["scheduling", "timesheets", "financial"]);

function groupKeyFor(perm: Permission): ProfilePermissionGroupKey {
  if (STAFF_PHONE.has(perm)) return "staff_phone";
  const section = PERMISSION_SECTION_MAP[perm];
  if (SCHEDULE_MONEY_SECTIONS.has(section)) return "schedule_money";
  return "people_files";
}

const LABELS: Record<ProfilePermissionGroupKey, string> = {
  people_files: "people & files",
  schedule_money: "schedule & money",
  staff_phone: "Staff phone permissions",
};

/** Profile-tab order: people & files, then schedule & money, then Staff phone. */
export function profilePermissionGroups(): ProfilePermissionGroup[] {
  const buckets: Record<ProfilePermissionGroupKey, Permission[]> = {
    people_files: [],
    schedule_money: [],
    staff_phone: [],
  };
  for (const perm of ALL_PERMISSIONS) {
    buckets[groupKeyFor(perm)].push(perm);
  }
  return PROFILE_PERMISSION_GROUP_KEYS.map((key) => ({
    key,
    label: LABELS[key],
    permissions: buckets[key],
  }));
}
