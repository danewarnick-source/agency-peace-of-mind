import { firstNameWithMiddle, splitPersonName } from "./person-name.ts";

export const STAFF_PROFILE_IDENTITY_QUERY_ROOT = "staff-profile" as const;

export type StaffIdentityProfile = {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  hire_date: string | null;
  start_date: string | null;
  employee_id?: string | null;
  photo_path?: string | null;
  photo_updated_at?: string | null;
};

export type StaffIdentityMember = {
  id: string;
  role: string;
  job_title?: string | null;
  user_id?: string | null;
  active?: boolean;
  created_at?: string | null;
};

export type StaffIdentityDraft = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: string;
  hire_date: string;
  employee_id: string;
  job_title: string;
};

export type StaffIdentityBundle = {
  member: StaffIdentityMember & { user_id: string };
  profile: StaffIdentityProfile | null;
};

/** React Query key for the employee Profile identity load. Always includes route staffId. */
export function staffProfileIdentityQueryKey(
  organizationId: string | null | undefined,
  staffId: string,
) {
  return [STAFF_PROFILE_IDENTITY_QUERY_ROOT, organizationId ?? "", staffId] as const;
}

export function staffNameParts(profile: StaffIdentityProfile | null): {
  first: string;
  last: string;
} {
  const first = (profile?.first_name ?? "").trim();
  const last = (profile?.last_name ?? "").trim();
  if (first || last) return { first, last };
  const split = splitPersonName(profile?.full_name);
  return { first: firstNameWithMiddle(split.first, split.middle), last: split.last };
}

export function staffProfileDisplayName(profile: StaffIdentityProfile | null): string {
  const parts = staffNameParts(profile);
  const fromParts = `${parts.first} ${parts.last}`.trim();
  return (
    fromParts ||
    (profile?.full_name && profile.full_name.trim()) ||
    (profile?.username && profile.username.trim()) ||
    (profile?.email && profile.email.trim()) ||
    "Name not set"
  );
}

export function identityDraftFrom(
  profile: StaffIdentityProfile | null,
  member: StaffIdentityMember,
): StaffIdentityDraft {
  const names = staffNameParts(profile);
  return {
    first_name: names.first,
    last_name: names.last,
    email: profile?.email ?? "",
    phone: profile?.phone ?? "",
    role: member.role,
    hire_date: profile?.hire_date ?? profile?.start_date ?? "",
    employee_id: profile?.employee_id ?? "",
    job_title: member.job_title ?? "",
  };
}

export function memberBelongsToRouteStaff(
  member: StaffIdentityMember | null | undefined,
  staffId: string,
): boolean {
  if (!member || !staffId) return false;
  return !member.user_id || member.user_id === staffId;
}

export function profileBelongsToRouteStaff(
  profile: StaffIdentityProfile | null | undefined,
  staffId: string,
): boolean {
  if (!staffId) return false;
  if (!profile) return true;
  return !profile.id || profile.id === staffId;
}

function requireRouteStaffId(
  organizationId: string,
  staffId: string,
): {
  organizationId: string;
  staffId: string;
} {
  const org = organizationId.trim();
  const staff = staffId.trim();
  if (!org) throw new Error("organizationId is required");
  if (!staff) throw new Error("staffId is required");
  return { organizationId: org, staffId: staff };
}

/**
 * Load the organization member + profile for the route staffId only.
 * Never falls back to the signed-in session user. Rows that do not match
 * staffId are treated as not found so an admin cannot see their own identity
 * on another employee's Profile.
 */
export async function loadStaffProfileIdentity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  args: { organizationId: string; staffId: string },
): Promise<StaffIdentityBundle | null> {
  const { organizationId, staffId } = requireRouteStaffId(args.organizationId, args.staffId);

  const { data: m, error: mErr } = await supabase
    .from("organization_members")
    .select("id, role, job_title, active, user_id, created_at")
    .eq("organization_id", organizationId)
    .eq("user_id", staffId)
    .maybeSingle();
  if (mErr) throw mErr;
  const member = m as (StaffIdentityMember & { user_id: string }) | null;
  if (!member) return null;
  if (!memberBelongsToRouteStaff(member, staffId)) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: p, error: pErr } = await (supabase as any)
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, email, username, hire_date, start_date, photo_path, photo_updated_at, phone, employee_id",
    )
    .eq("id", staffId)
    .maybeSingle();
  if (pErr) throw pErr;
  const profile = (p ?? null) as StaffIdentityProfile | null;
  if (!profileBelongsToRouteStaff(profile, staffId)) {
    return { member, profile: null };
  }
  return { member, profile };
}
