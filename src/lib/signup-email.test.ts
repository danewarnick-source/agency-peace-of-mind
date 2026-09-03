import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authAdminUsersHasExactEmail,
  escapeIlikeExact,
  isValidSignupEmail,
  normalizeSignupEmail,
  signupEmailsAreSame,
} from "./signup-email.ts";

describe("signup email uniqueness", () => {
  it("lowercases and trims only", () => {
    assert.equal(normalizeSignupEmail("  DaneWarnick+PI1@Gmail.com  "), "danewarnick+pi1@gmail.com");
  });

  it("keeps Gmail plus-aliases distinct from the untagged address", () => {
    assert.equal(
      signupEmailsAreSame("danewarnick@gmail.com", "danewarnick+pi1@gmail.com"),
      false,
    );
    assert.equal(
      signupEmailsAreSame("danewarnick+pi1@gmail.com", "danewarnick+pi2@gmail.com"),
      false,
    );
    assert.equal(
      signupEmailsAreSame("DaneWarnick+PI1@gmail.com", "danewarnick+pi1@gmail.com"),
      true,
    );
  });

  it("does not Gmail-dot-normalize the local part", () => {
    assert.equal(signupEmailsAreSame("dane.warnick@gmail.com", "danewarnick@gmail.com"), false);
    assert.equal(normalizeSignupEmail("dane.warnick@gmail.com"), "dane.warnick@gmail.com");
  });

  it("accepts plus-aliases as valid emails", () => {
    assert.equal(isValidSignupEmail("danewarnick+pi1@gmail.com"), true);
    assert.equal(isValidSignupEmail("not-an-email"), false);
  });

  it("escapes ILIKE wildcards without touching plus", () => {
    assert.equal(escapeIlikeExact("danewarnick+pi1@gmail.com"), "danewarnick+pi1@gmail.com");
    assert.equal(escapeIlikeExact("foo_bar@agency.com"), "foo\\_bar@agency.com");
    assert.equal(escapeIlikeExact("100%@agency.com"), "100\\%@agency.com");
  });

  it("matches an exact mailbox in a GoTrue admin users payload", () => {
    assert.equal(
      authAdminUsersHasExactEmail(
        { users: [{ email: "DaneWarnick+PI1@gmail.com" }] },
        "danewarnick+pi1@gmail.com",
      ),
      true,
    );
    assert.equal(
      authAdminUsersHasExactEmail(
        { users: [{ email: "danewarnick@gmail.com" }] },
        "danewarnick+pi1@gmail.com",
      ),
      false,
    );
    assert.equal(authAdminUsersHasExactEmail({ users: [] }, "danewarnick+pi1@gmail.com"), false);
    assert.equal(authAdminUsersHasExactEmail({}, "danewarnick+pi1@gmail.com"), false);
  });
});
