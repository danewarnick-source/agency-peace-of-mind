import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIGNUP_CONFIRM_CONTINUE_LABEL,
  SIGNUP_CONFIRM_EMAIL_MESSAGE,
  isRbacSeedTriggerError,
  isSignupEmailNotConfirmedError,
  messageForSignupWorkspaceReason,
  signupHasSession,
  workspaceNameFromSignup,
} from "./signup-workspace.ts";

describe("signup workspace / session", () => {
  it("requires a real session (access token + user id)", () => {
    assert.equal(signupHasSession(null), false);
    assert.equal(signupHasSession({ access_token: "tok", user: null }), false);
    assert.equal(signupHasSession({ access_token: "tok", user: { id: "u1" } }), true);
  });

  it("detects email_not_confirmed so Account can stay on the confirm sentence", () => {
    assert.equal(isSignupEmailNotConfirmedError({ code: "email_not_confirmed" }), true);
    assert.equal(isSignupEmailNotConfirmedError({ message: "Email not confirmed" }), true);
    assert.equal(isSignupEmailNotConfirmedError({ code: "invalid_credentials" }), false);
    assert.match(SIGNUP_CONFIRM_CONTINUE_LABEL, /confirmed/i);
  });

  it("splits no-session copy from org / trigger failures", () => {
    assert.equal(messageForSignupWorkspaceReason("no_session"), SIGNUP_CONFIRM_EMAIL_MESSAGE);
    assert.match(messageForSignupWorkspaceReason("org_query_error"), /access error/i);
    assert.match(messageForSignupWorkspaceReason("trigger_blocked"), /sql handoff/i);
    assert.doesNotMatch(messageForSignupWorkspaceReason("no_session"), /workspace isn't ready/i);
  });

  it("detects the live rbac_roles seed-trigger failure", () => {
    assert.equal(
      isRbacSeedTriggerError('handle_new_user failed: relation "public.rbac_roles" does not exist'),
      true,
    );
    assert.equal(isRbacSeedTriggerError("permission denied for table organizations"), false);
  });

  it("names the workspace from the agency, not True North", () => {
    assert.equal(workspaceNameFromSignup({ agencyName: "Sunrise Supports" }), "Sunrise Supports");
    assert.equal(workspaceNameFromSignup({ emailLocalPart: "danewarnick+pi1" }), "danewarnick+pi1's workspace");
    assert.doesNotMatch(workspaceNameFromSignup({ agencyName: "Test agency 1" }), /True North/i);
  });
});
