import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_PWNED_PASSWORD_MESSAGE,
  hibpRangeIncludesSha1,
  hibpSha1Prefix,
  isAuthPwnedPasswordMessage,
  sha1HexUpper,
  weakPasswordCopyFromAuth,
} from "./signup-password.ts";

describe("signup Auth leaked / weak-or-easy password copy", () => {
  it("keeps GoTrue's exact pwned message", () => {
    assert.equal(
      AUTH_PWNED_PASSWORD_MESSAGE,
      "Password is known to be weak and easy to guess, please choose a different one.",
    );
  });

  it("recognizes Auth leaked/weak copy and not the 8-character / character-set hints", () => {
    assert.equal(isAuthPwnedPasswordMessage(AUTH_PWNED_PASSWORD_MESSAGE), true);
    assert.equal(
      isAuthPwnedPasswordMessage("Password is known to be weak or leaked. Please use a different password."),
      true,
    );
    assert.equal(isAuthPwnedPasswordMessage("Password should be at least 8 characters."), false);
    assert.equal(
      isAuthPwnedPasswordMessage("Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz."),
      false,
    );
  });

  it("reuses Auth's own wording when present", () => {
    const fromAuth = "Password is known to be weak and easy to guess, please choose a different one.";
    assert.equal(weakPasswordCopyFromAuth(fromAuth), fromAuth);
    assert.equal(weakPasswordCopyFromAuth("something else"), AUTH_PWNED_PASSWORD_MESSAGE);
  });

  it("matches HIBP k-anonymity suffixes the same way Auth does", async () => {
    const sha1 = await sha1HexUpper("password");
    assert.equal(sha1, "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8");
    assert.equal(hibpSha1Prefix(sha1), "5BAA6");
    assert.equal(
      hibpRangeIncludesSha1("1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\n00AABB:0\n", sha1),
      true,
    );
    assert.equal(hibpRangeIncludesSha1("00AABB:12\n", sha1), false);
    assert.equal(hibpRangeIncludesSha1("1E4C9B93F3F0682250B6CF8331B7EE68FD8:0\n", sha1), false);
  });
});
