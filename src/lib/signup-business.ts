/**
 * Business Details save helpers.
 *
 * Live Hive-Platform (2026-09-03):
 * - PI2: profile PATCH 204; organizations stayed NULL because
 *   ensureSignupWorkspace (service-role) threw before the org write.
 * - PI10: name/contact/state/provider wrote; billing_sms_phone stayed
 *   NULL. Stale client still POSTed setBillingSmsPhoneAtSignup as
 *   /_serverFn/81909d505cfb… After that import was dropped, the new
 *   deploy no longer registered the hash → 500 "Server function info
 *   not found". useServerFn returns {status:500, unhandled:true} and
 *   does not throw, so Continue advanced with no toast.
 *
 * Happy path is the session-client org PATCH (includes phone). Advance
 * only after a verified read-back. No PHI in messages.
 */

export const SIGNUP_BUSINESS_SAVE_ERROR_MESSAGE =
  "Couldn't save your business details — please try again.";

export const SIGNUP_BUSINESS_VERIFY_SELECT =
  "id, name, account_contact_name, billing_sms_phone, state_code";

export type SignupBusinessOrgPatch = {
  name: string;
  state_code: "UT";
  dhhs_provider_id: string | null;
  account_contact_name: string | null;
  account_contact_email: string | null;
  billing_sms_phone: string | null;
  training_only?: boolean;
};

export type SignupBusinessVerifiedRow = {
  id?: string | null;
  name?: string | null;
  account_contact_name?: string | null;
  billing_sms_phone?: string | null;
  state_code?: string | null;
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

export function isSignupServerFnFailure(result: unknown): boolean {
  if (result == null || typeof result !== "object") return false;
  const row = result as { status?: unknown; unhandled?: unknown; message?: unknown };
  if (row.unhandled === true) return true;
  if (row.status === 500) return true;
  const message = String(row.message ?? "");
  return /server function info not found/i.test(message);
}

export function orgIdFromEnsureWorkspaceResult(result: unknown): string | null {
  if (isSignupServerFnFailure(result)) return null;
  if (result == null || typeof result !== "object") return null;
  const row = result as { ok?: unknown; orgId?: unknown };
  if (row.ok !== true) return null;
  return asSignupOrgId(row.orgId);
}

export function signupBusinessWriteOk(
  row: SignupBusinessVerifiedRow | null | undefined,
): boolean {
  if (!row) return false;
  return Boolean(
    String(row.name ?? "").trim() &&
      String(row.account_contact_name ?? "").trim() &&
      String(row.billing_sms_phone ?? "").trim() &&
      String(row.state_code ?? "").trim(),
  );
}
