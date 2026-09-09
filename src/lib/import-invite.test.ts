import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSendImportInvite,
  classifyImportInvite,
  hasUsableInviteEmail,
  summarizeImportInviteBuckets,
} from "./import-invite.ts";

describe("hasUsableInviteEmail", () => {
  it("requires a non-empty address with @", () => {
    assert.equal(hasUsableInviteEmail("jane@agency.org"), true);
    assert.equal(hasUsableInviteEmail("  "), false);
    assert.equal(hasUsableInviteEmail("no-at"), false);
    assert.equal(hasUsableInviteEmail(null), false);
  });
});

describe("classifyImportInvite", () => {
  it("buckets missing email even when a login flag is set", () => {
    assert.equal(
      classifyImportInvite({
        email: "",
        mustChangePassword: true,
        invitationStatus: null,
      }),
      "missing_email",
    );
  });

  it("treats must_change_password as ready to invite", () => {
    assert.equal(
      classifyImportInvite({
        email: "new@agency.org",
        mustChangePassword: true,
        invitationStatus: "pending",
      }),
      "ready",
    );
  });

  it("never re-invites someone who already accepted", () => {
    assert.equal(
      classifyImportInvite({
        email: "done@agency.org",
        mustChangePassword: true,
        invitationStatus: "accepted",
      }),
      "already_login",
    );
  });

  it("treats a finished login as already having access", () => {
    assert.equal(
      classifyImportInvite({
        email: "dsp@agency.org",
        mustChangePassword: false,
        invitationStatus: null,
      }),
      "already_login",
    );
  });
});

describe("canSendImportInvite", () => {
  it("allows ready rows and blocks accepted unless resend is explicit", () => {
    const accepted = {
      email: "done@agency.org",
      mustChangePassword: false,
      invitationStatus: "accepted",
    };
    assert.equal(canSendImportInvite({
      email: "new@agency.org",
      mustChangePassword: true,
      invitationStatus: null,
    }), true);
    assert.equal(canSendImportInvite(accepted), false);
    assert.equal(canSendImportInvite(accepted, { resendAccepted: true }), true);
    assert.equal(
      canSendImportInvite({
        email: null,
        mustChangePassword: true,
        invitationStatus: null,
      }),
      false,
    );
  });

  it("force-sends explicit hire-wizard invites unless already accepted", () => {
    assert.equal(
      canSendImportInvite(
        { email: "new@agency.org", mustChangePassword: null, invitationStatus: "pending" },
        { force: true },
      ),
      true,
    );
    assert.equal(
      canSendImportInvite(
        { email: "done@agency.org", mustChangePassword: null, invitationStatus: "accepted" },
        { force: true },
      ),
      false,
    );
  });
});

describe("summarizeImportInviteBuckets", () => {
  it("counts the three done-page totals", () => {
    assert.deepEqual(
      summarizeImportInviteBuckets([
        { email: "a@x.org", mustChangePassword: true, invitationStatus: null },
        { email: "b@x.org", mustChangePassword: true, invitationStatus: null },
        { email: "", mustChangePassword: true, invitationStatus: null },
        { email: "c@x.org", mustChangePassword: false, invitationStatus: null },
      ]),
      { ready: 2, missing_email: 1, already_login: 1 },
    );
  });
});
