import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASK_ADMIN_MANUAL,
  extractInviteToken,
  humanizeInviteError,
  inviteFailureMessage,
  inviteJoinUrl,
  inviteTokenFromSearchStr,
  isNewAgencySignupCopy,
  isValidJoinPassword,
  isValidJoinUsername,
  joinConfirmLiveMessage,
  joinHomeForRole,
  joinPasswordLiveMessage,
  joinSetsAuthPassword,
  joinUsernameLiveMessage,
  suggestJoinUsername,
} from "./join-invite.ts";

describe("extractInviteToken", () => {
  it("reads ?invite=", () => {
    assert.equal(extractInviteToken({ invite: "abc12345" }), "abc12345");
  });
  it("reads ?token= as a fallback", () => {
    assert.equal(extractInviteToken({ token: "xyz98765" }), "xyz98765");
  });
  it("prefers invite over token", () => {
    assert.equal(extractInviteToken({ invite: "from-invite", token: "from-token" }), "from-invite");
  });
  it("returns null when missing, empty, or whitespace", () => {
    assert.equal(extractInviteToken({}), null);
    assert.equal(extractInviteToken({ invite: "" }), null);
    assert.equal(extractInviteToken({ invite: "   " }), null);
    assert.equal(extractInviteToken({ invite: 12 }), null);
  });
});

describe("inviteTokenFromSearchStr", () => {
  it("reads invite from a query string and ignores signup-only URLs", () => {
    assert.equal(inviteTokenFromSearchStr("?invite=abc12345"), "abc12345");
    assert.equal(inviteTokenFromSearchStr("invite=abc12345"), "abc12345");
    assert.equal(inviteTokenFromSearchStr("?token=xyz98765"), "xyz98765");
    assert.equal(inviteTokenFromSearchStr(""), null);
    assert.equal(inviteTokenFromSearchStr("?welcome=1"), null);
  });
});

describe("inviteJoinUrl", () => {
  it("builds /join?invite= and strips a trailing slash on origin", () => {
    assert.equal(
      inviteJoinUrl("https://app.example.com/", "tok+en"),
      "https://app.example.com/join?invite=tok%2Ben",
    );
  });
  it("rewrites a Lovable origin to hivecertify.com", () => {
    assert.equal(
      inviteJoinUrl("https://agency-peace-of-mind.lovable.app", "tok"),
      "https://hivecertify.com/join?invite=tok",
    );
  });
});

describe("humanizeInviteError", () => {
  it("maps RPC phrases to a human sentence with the manual-add hint", () => {
    assert.match(humanizeInviteError("Invitation not found"), /isn't valid/i);
    assert.match(humanizeInviteError("Invitation expired"), /expired/i);
    assert.match(humanizeInviteError("Invitation already used"), /already used/i);
    assert.match(
      humanizeInviteError("Invitation email does not match your account"),
      /different email/i,
    );
    for (const msg of ["Invitation not found", "Invitation expired", "Invitation already used"]) {
      assert.match(humanizeInviteError(msg), new RegExp(ASK_ADMIN_MANUAL.replace(".", "\\.")));
    }
  });
  it("does not dump a UUID", () => {
    const uuid = "7fabcf5d-f826-487f-8730-8b0c3f1969bb";
    const out = humanizeInviteError(`Invitation not found for ${uuid}`);
    assert.equal(out.includes(uuid), false);
    assert.match(out, /admin/i);
  });
  it("does not dump raw SQL parentheses blobs", () => {
    const out = humanizeInviteError('new row violates check constraint "invitations_role_check"');
    assert.equal(out.includes("invitations_role_check"), false);
    assert.match(out, /admin/i);
  });
});

describe("joinHomeForRole", () => {
  it("sends staff to the employee home and admins to Admin Home", () => {
    assert.equal(joinHomeForRole("employee"), "/employee");
    assert.equal(joinHomeForRole("admin"), "/dashboard");
    assert.equal(joinHomeForRole("manager"), "/dashboard");
    assert.equal(joinHomeForRole("program_manager"), "/dashboard");
  });
});

describe("join field rules", () => {
  it("requires 8+ characters and no digit / symbol class", () => {
    assert.equal(isValidJoinPassword("short1"), false);
    assert.equal(isValidJoinPassword("longenough"), true);
    assert.equal(isValidJoinPassword("goodpass1"), true);
  });
  it("never overwrites an existing account's password unless first-login is pending", () => {
    assert.equal(joinSetsAuthPassword(true), false);
    assert.equal(joinSetsAuthPassword(false), true);
    assert.equal(joinSetsAuthPassword(true, { mustChangePassword: true }), true);
    assert.equal(joinSetsAuthPassword(true, { mustChangePassword: false }), false);
  });
  it("accepts an email as the username (same rule as owner signup)", () => {
    assert.equal(isValidJoinUsername("ab"), false);
    assert.equal(isValidJoinUsername("1staff"), false);
    assert.equal(isValidJoinUsername("staff@agency.com"), true);
    assert.equal(isValidJoinUsername("dsp_jane"), true);
  });
  it("defaults the username to the invite email, not a sanitized local-part", () => {
    assert.equal(suggestJoinUsername("jane.doe@example.com"), "jane.doe@example.com");
    assert.equal(suggestJoinUsername("DSP_Jane+night@Example.com"), "dsp_jane+night@example.com");
    assert.equal(suggestJoinUsername("1lead.house@example.com"), "1lead.house@example.com");
    assert.equal(isValidJoinUsername(suggestJoinUsername("tester@example.com")), true);
  });
  it("live-validates an email username as good", () => {
    assert.equal(joinUsernameLiveMessage(""), null);
    const emailLike = joinUsernameLiveMessage("tester@example.com");
    assert.equal(emailLike?.ok, true);
    assert.match(String(emailLike?.text), /email/i);
    assert.doesNotMatch(String(emailLike?.text), /start with a letter|underscores only/i);
    assert.equal(joinUsernameLiveMessage("ab")?.ok, false);
    assert.equal(joinUsernameLiveMessage("dsp_jane")?.ok, true);
  });
  it("live-validates new-password length and confirm match", () => {
    assert.equal(joinPasswordLiveMessage(""), null);
    assert.equal(joinPasswordLiveMessage("short1")?.ok, false);
    assert.equal(joinPasswordLiveMessage("longenough")?.ok, true);
    assert.equal(joinConfirmLiveMessage("longenough", ""), null);
    assert.equal(joinConfirmLiveMessage("longenough", "different")?.ok, false);
    assert.equal(joinConfirmLiveMessage("longenough", "longenough")?.ok, true);
  });
});

describe("isNewAgencySignupCopy", () => {
  it("flags payment / team-size signup copy", () => {
    assert.equal(isNewAgencySignupCopy("Team & pricing"), true);
    assert.equal(isNewAgencySignupCopy("Join True North Supports as Staff"), false);
  });
});

describe("inviteFailureMessage", () => {
  it("never tells people to start a new company", () => {
    for (const reason of ["missing", "not_found", "expired", "used", "revoked"] as const) {
      const msg = inviteFailureMessage(reason).toLowerCase();
      assert.equal(msg.includes("signup"), false);
      assert.equal(msg.includes("new company"), false);
      assert.equal(msg.includes("new agency"), false);
      assert.match(inviteFailureMessage(reason), /admin/i);
    }
  });
});
