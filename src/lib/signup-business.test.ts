import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asSignupOrgId,
  isSignupServerFnFailure,
  orgIdFromCreatedByRow,
  orgIdFromEnsureWorkspaceResult,
  orgIdFromMembershipRow,
  signupBusinessOrgPatch,
  signupBusinessWriteOk,
} from "./signup-business.ts";

describe("signup business org patch", () => {
  it("writes workspace name, contact, phone, UT, and provider number", () => {
    const patch = signupBusinessOrgPatch({
      agencyName: "  Test 1  ",
      contactName: "Jeffrey Warnick",
      contactEmail: "owner@example.com",
      providerNumber: "12345",
      phoneE164: "+18015550123",
      trainingOnly: false,
    });
    assert.equal(patch.name, "Test 1");
    assert.equal(patch.state_code, "UT");
    assert.equal(patch.dhhs_provider_id, "12345");
    assert.equal(patch.account_contact_name, "Jeffrey Warnick");
    assert.equal(patch.account_contact_email, "owner@example.com");
    assert.equal(patch.billing_sms_phone, "+18015550123");
    assert.equal("training_only" in patch, false);
  });

  it("sets training_only only for the training flow", () => {
    const patch = signupBusinessOrgPatch({
      agencyName: "Train Co",
      contactName: "Pat",
      contactEmail: null,
      providerNumber: "",
      phoneE164: "+18015550123",
      trainingOnly: true,
    });
    assert.equal(patch.training_only, true);
    assert.equal(patch.dhhs_provider_id, null);
  });
});

describe("signup org id parsers", () => {
  it("reads membership and created_by rows", () => {
    assert.equal(
      orgIdFromMembershipRow({ organization_id: "1b286038-8755-42f1-8f38-4850fd6b975d" }),
      "1b286038-8755-42f1-8f38-4850fd6b975d",
    );
    assert.equal(orgIdFromCreatedByRow({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" }), "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");
    assert.equal(asSignupOrgId(""), null);
    assert.equal(orgIdFromMembershipRow({ organization_id: null }), null);
  });
});

describe("signup server fn failure", () => {
  it("treats unhandled 500 and missing-fn hashes as hard failures", () => {
    assert.equal(
      isSignupServerFnFailure({
        status: 500,
        unhandled: true,
        message:
          "Server function info not found for 81909d505cfb3331d5d9a7438f345a15a0a3c55b2b3c3edef8d6e7a316ade347",
      }),
      true,
    );
    assert.equal(isSignupServerFnFailure({ ok: true, orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" }), false);
    assert.equal(orgIdFromEnsureWorkspaceResult({ status: 500, unhandled: true, message: "x" }), null);
    assert.equal(
      orgIdFromEnsureWorkspaceResult({ ok: true, orgId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1" }),
      "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    );
  });
});

describe("signup business write gate", () => {
  it("requires name, contact, phone, and state before Continue advances", () => {
    assert.equal(
      signupBusinessWriteOk({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        name: "Walk Test Agency",
        account_contact_name: "Walk Tester",
        billing_sms_phone: "+18015550123",
        state_code: "UT",
      }),
      true,
    );
    assert.equal(
      signupBusinessWriteOk({
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
        name: "Walk Test Agency",
        account_contact_name: "Walk Tester",
        billing_sms_phone: null,
        state_code: "UT",
      }),
      false,
    );
    assert.equal(signupBusinessWriteOk(null), false);
  });
});
