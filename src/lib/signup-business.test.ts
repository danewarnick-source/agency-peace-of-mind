import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asSignupOrgId,
  orgIdFromCreatedByRow,
  orgIdFromMembershipRow,
  signupBusinessOrgPatch,
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
