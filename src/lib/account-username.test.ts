import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultUsernameFromEmail,
  isValidEmailUsername,
  isValidHandleUsername,
  isValidUsername,
  resolveAccountUsername,
  usernameLiveMessage,
} from "./account-username.ts";

describe("account username (email-as-username)", () => {
  it("accepts a full email as a username", () => {
    assert.equal(isValidUsername("tester@example.com"), true);
    assert.equal(isValidEmailUsername("jane.doe+night@agency.org"), true);
    assert.equal(isValidUsername("  DSP@TrueNorth.example  "), true);
  });

  it("still accepts existing letter-led handles", () => {
    assert.equal(isValidHandleUsername("dsp_jane"), true);
    assert.equal(isValidUsername("dsp_jane"), true);
    assert.equal(isValidUsername("ab"), false);
    assert.equal(isValidUsername("1staff"), false);
  });

  it("rejects a broken email and empty values", () => {
    assert.equal(isValidUsername(""), false);
    assert.equal(isValidUsername("staff@"), false);
    assert.equal(isValidUsername("@agency.com"), false);
    assert.equal(isValidEmailUsername("not-an-email"), false);
  });

  it("defaults username to the email mailbox", () => {
    assert.equal(defaultUsernameFromEmail("Jane.Doe@Example.com"), "jane.doe@example.com");
    assert.equal(resolveAccountUsername({ email: "staff@agency.com" }), "staff@agency.com");
    assert.equal(
      resolveAccountUsername({ username: "  ", email: "staff@agency.com" }),
      "staff@agency.com",
    );
    assert.equal(
      resolveAccountUsername({ username: "dsp_jane", email: "staff@agency.com" }),
      "dsp_jane",
    );
    assert.equal(
      resolveAccountUsername({ username: "Staff@Agency.com", email: "other@x.com" }),
      "staff@agency.com",
    );
  });

  it("live-validates emails as good, not as 'must start with a letter'", () => {
    assert.equal(usernameLiveMessage(""), null);
    const emailOk = usernameLiveMessage("tester@example.com");
    assert.equal(emailOk?.ok, true);
    assert.match(String(emailOk?.text), /email/i);
    assert.doesNotMatch(String(emailOk?.text), /start with a letter|underscores only/i);

    const incomplete = usernameLiveMessage("tester@");
    assert.equal(incomplete?.ok, false);
    assert.doesNotMatch(String(incomplete?.text), /start with a letter/i);

    assert.equal(usernameLiveMessage("dsp_jane")?.ok, true);
    const handleFail = usernameLiveMessage("1staff");
    assert.equal(handleFail?.ok, false);
    assert.match(String(handleFail?.text), /email/i);
  });
});
