import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  SIGNUP_CONFIRM_CONTINUE_LABEL,
  SIGNUP_CONFIRM_EMAIL_MESSAGE,
  isRbacSeedTriggerError,
  isSignupEmailNotConfirmedError,
  messageForSignupWorkspaceReason,
  seedSignupOrgRolePermissions,
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

  it("seeds role_permissions via RPC and does not throw on failure", async () => {
    const calls: Array<{ fn: string; org: string }> = [];
    const ok = await seedSignupOrgRolePermissions(async (fn, args) => {
      calls.push({ fn, org: args._org });
      return { error: null };
    }, "org-1");
    assert.equal(ok, true);
    assert.deepEqual(calls, [{ fn: "seed_org_role_permissions", org: "org-1" }]);

    const failed = await seedSignupOrgRolePermissions(async () => {
      return { error: { message: "function does not exist" } };
    }, "org-2");
    assert.equal(failed, false);

    const empty = await seedSignupOrgRolePermissions(async () => ({ error: null }), "  ");
    assert.equal(empty, false);
  });

  it("signup workspace provision calls the role_permissions seed", () => {
    const src = readFileSync(new URL("./signup-workspace.functions.ts", import.meta.url), "utf8");
    assert.match(src, /seedSignupOrgRolePermissions/);
    assert.match(src, /seed_org_role_permissions/);
  });

  it("defaults the owner profile username to the signup email", () => {
    const src = readFileSync(new URL("./signup-workspace.functions.ts", import.meta.url), "utf8");
    assert.match(src, /defaultUsernameFromEmail/);
    assert.match(src, /username:\s*defaultUsernameFromEmail/);
  });
});

describe("signup Create account env + training link", () => {
  it("reads Vercel VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY statically", () => {
    const env = readFileSync(new URL("./supabase-public-env.ts", import.meta.url), "utf8");
    assert.match(env, /import\.meta\.env\.VITE_SUPABASE_URL/);
    assert.match(env, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
    assert.match(env, /VITE_SUPABASE_ANON_KEY/);
  });

  it("Create account does not require SERVICE_ROLE_KEY", () => {
    const checks = readFileSync(new URL("./signup-checks.functions.ts", import.meta.url), "utf8");
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    assert.match(checks, /readSupabaseAdminEnv/);
    assert.match(checks, /exists: false/);
    assert.match(signup, /\(supabase as any\)\.auth\.signUp/);
  });

  it("keeps the quiet training link on Training, not Account", () => {
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    const account = signup.slice(
      signup.indexOf("function Step1Account"),
      signup.indexOf("function Step3Business"),
    );
    const training = signup.slice(signup.indexOf("function Step5Training"));
    assert.doesNotMatch(account, /signup-training-only-link/);
    assert.match(training, /signup-training-only-link/);
    assert.match(training, /Just need training\? Buy classes without the office\./);
    assert.equal(signup.includes('"Training"'), true);
  });
});
