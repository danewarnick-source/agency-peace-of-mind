import { firstNameWithMiddle, splitPersonName } from "./person-name.ts";

export type StaffIdentityProfile = {
  first_name?: string | null;
  last_name?: string | null;
  full_name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  hire_date: string | null;
  start_date: string | null;
  employee_id?: string | null;
};

export type StaffIdentityMember = {
  id: string;
  role: string;
  job_title?: string | null;
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
