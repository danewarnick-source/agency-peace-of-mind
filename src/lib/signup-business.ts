/**
 * Business Details save helpers.
 *
 * Live Hive-Platform (2026-09-03): profile PATCH 204 landed for the PI2
 * walk; no organizations PATCH followed. Continue called ensureSignupWorkspace
 * (service-role admin). That server fn threw → catch toast → org fields stayed
 * null. The user already had admin membership, so the org write can go through
 * the session client. No PHI in messages.
 */

export const SIGNUP_BUSINESS_SAVE_ERROR_MESSAGE =
  "Couldn't save your business details — please try again.";

export type SignupBusinessOrgPatch = {
  name: string;
  state_code: "UT";
  dhhs_provider_id: string | null;
  account_contact_name: string | null;
  account_contact_email: string | null;
  billing_sms_phone: string | null;
  training_only?: boolean;
};

export function asSignupOrgId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function signupBusinessOrgPatch(input: {
  agencyName: string;
  contactName: string;
  contactEmail: string | null;
  providerNumber: string;
  phoneE164: string | null;
  trainingOnly: boolean;
}): SignupBusinessOrgPatch {
  const patch: SignupBusinessOrgPatch = {
    name: String(input.agencyName ?? "").trim(),
    state_code: "UT",
    dhhs_provider_id: String(input.providerNumber ?? "").trim() || null,
    account_contact_name: String(input.contactName ?? "").trim() || null,
    account_contact_email: input.contactEmail,
    billing_sms_phone: input.phoneE164,
  };
  if (input.trainingOnly) patch.training_only = true;
  return patch;
}

export function orgIdFromMembershipRow(
  row: { organization_id?: string | null } | null | undefined,
): string | null {
  return asSignupOrgId(row?.organization_id);
}

export function orgIdFromCreatedByRow(
  row: { id?: string | null } | null | undefined,
): string | null {
  return asSignupOrgId(row?.id);
}
