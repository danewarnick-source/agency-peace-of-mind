import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GENERIC_LOGIN_ERROR,
  completePasswordSignIn,
  isEmailIdentifier,
  loginSearchHasInviteToken,
  publicLoginErrorMessage,
  type PasswordSignInDeps,
} from "./login-auth.ts";

function deps(overrides: Partial<PasswordSignInDeps> = {}): PasswordSignInDeps {
  return {
    signInWithEmail: async () => ({ error: null, user: { id: "user-1" } }),
    signInWithUsername: async () => ({ access_token: "a", refresh_token: "r" }),
    setSession: async () => ({ error: null }),
    getAccountStatus: async () => "active",
    signOut: async () => {},
    ...overrides,
  };
}

describe("isEmailIdentifier", () => {
  it("treats an @ as email and everything else as username", () => {
    assert.equal(isEmailIdentifier("dane@truenorth.example"), true);
    assert.equal(isEmailIdentifier("dane"), false);
  });
});

describe("loginSearchHasInviteToken", () => {
  it("does not treat a bare /login as join", () => {
    assert.equal(loginSearchHasInviteToken({}), false);
    assert.equal(loginSearchHasInviteToken({ invite: "" }), false);
    assert.equal(loginSearchHasInviteToken({ token: "   " }), false);
  });
  it("only flags a real invite/token query", () => {
    assert.equal(loginSearchHasInviteToken({ invite: "abc12345" }), true);
    assert.equal(loginSearchHasInviteToken({ token: "xyz98765" }), true);
  });
});

describe("publicLoginErrorMessage", () => {
  it("keeps wrong-password generic so accounts are not enumerable", () => {
    assert.equal(publicLoginErrorMessage("Invalid login credentials"), GENERIC_LOGIN_ERROR);
    assert.equal(publicLoginErrorMessage("Invalid username or password"), GENERIC_LOGIN_ERROR);
  });
  it("does not label rate-limit or unconfirmed email as a bad password", () => {
    assert.match(publicLoginErrorMessage("Too many requests"), /too many attempts/i);
    assert.match(publicLoginErrorMessage("Email not confirmed"), /confirm your email/i);
  });
});

describe("completePasswordSignIn", () => {
  it("accepts a valid email password and does not call username sign-in", async () => {
    let emailCalls = 0;
    let usernameCalls = 0;
    const result = await completePasswordSignIn(
      "owner@example.com",
      "correct-horse-1",
      deps({
        signInWithEmail: async (email, password) => {
          emailCalls += 1;
          assert.equal(email, "owner@example.com");
          assert.equal(password, "correct-horse-1");
          return { error: null, user: { id: "user-1" } };
        },
        signInWithUsername: async () => {
          usernameCalls += 1;
          return { access_token: "a", refresh_token: "r" };
        },
      }),
    );
    assert.deepEqual(result, { ok: true });
    assert.equal(emailCalls, 1);
    assert.equal(usernameCalls, 0);
  });

  it("rejects a wrong email password without weakening the check", async () => {
    const result = await completePasswordSignIn(
      "owner@example.com",
      "wrong-password",
      deps({
        signInWithEmail: async () => ({
          error: { message: "Invalid login credentials" },
          user: null,
        }),
      }),
    );
    assert.deepEqual(result, { ok: false, message: GENERIC_LOGIN_ERROR });
  });

  it("accepts a valid username password via the server adapter", async () => {
    const result = await completePasswordSignIn("dane", "correct-horse-1", deps());
    assert.deepEqual(result, { ok: true });
  });

  it("rejects a wrong username password", async () => {
    const result = await completePasswordSignIn(
      "dane",
      "nope",
      deps({
        signInWithUsername: async () => {
          throw new Error(GENERIC_LOGIN_ERROR);
        },
      }),
    );
    assert.deepEqual(result, { ok: false, message: GENERIC_LOGIN_ERROR });
  });
});
