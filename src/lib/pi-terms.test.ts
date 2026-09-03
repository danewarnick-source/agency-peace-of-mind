import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PI_LEGAL_NAME,
  PI_TERMS_BILLING_HEADING,
  PI_TERMS_BILLING_PARAS,
  PI_TERMS_CONTRACTS_HEADING,
  PI_TERMS_CONTRACTS_PARAS,
  PI_TERMS_INTRO,
  PI_TERMS_TITLE,
} from "./pi-terms.ts";

describe("Provider Interface terms draft", () => {
  it("names Provider Interface LLC, not Hive or Hive Certify", () => {
    assert.equal(PI_LEGAL_NAME, "Provider Interface LLC");
    assert.doesNotMatch(PI_LEGAL_NAME, /Hive/);
    assert.doesNotMatch(PI_TERMS_INTRO, /Hive Certify|Hive\b/);
    for (const para of PI_TERMS_BILLING_PARAS) {
      assert.doesNotMatch(para, /Hive Certify/);
    }
    for (const para of PI_TERMS_CONTRACTS_PARAS) {
      assert.doesNotMatch(para, /Hive Certify|DSPD/);
    }
  });

  it("locks the contracts heading and the audit meaning", () => {
    assert.equal(PI_TERMS_CONTRACTS_HEADING, "Contracts, funders, and audits");
    const body = PI_TERMS_CONTRACTS_PARAS.join(" ");
    assert.match(body, /do not guarantee you will pass an audit/i);
    assert.match(body, /read and follow your own contracts/i);
    assert.match(body, /your responsibility/i);
  });

  it("states the locked billing rules in plain language", () => {
    assert.equal(PI_TERMS_TITLE, "Terms");
    assert.equal(PI_TERMS_BILLING_HEADING, "Billing");
    const billing = PI_TERMS_BILLING_PARAS.join(" ");
    assert.match(billing, /not from a guess at signup/i);
    assert.match(billing, /not from staff count/i);
    assert.match(billing, /\$69 per person/);
    assert.match(billing, /\$350 minimum/);
    assert.match(billing, /leftover months/);
    assert.match(billing, /no cash refund/);
    assert.match(billing, /credit at renewal/);
    assert.match(billing, /cancel a prepaid year/i);
    assert.match(billing, /True North Supports is not billed/);
    assert.match(billing, /Stripe does not decide who is a client/);
    assert.doesNotMatch(billing, /DSPD|Scope of Work|GIV/);
  });

  it("renders the locked copy on /terms and the signup checkbox", () => {
    const page = readFileSync(new URL("../routes/terms.tsx", import.meta.url), "utf8");
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    const footer = readFileSync(new URL("../components/pi-landing/pi-public-footer.tsx", import.meta.url), "utf8");
    assert.match(page, /PI_LEGAL_NAME/);
    assert.match(page, /PI_TERMS_CONTRACTS_HEADING/);
    assert.match(page, /createFileRoute\("\/terms"\)/);
    assert.doesNotMatch(page, /Hive Certify/);
    assert.match(signup, /signup-tos-checkbox/);
    assert.match(signup, /signup-baa-checkbox/);
    assert.match(signup, /to="\/terms"/);
    assert.match(signup, /to="\/baa"/);
    assert.match(footer, /to="\/terms"/);
    assert.match(footer, /to="\/baa"/);
  });
});
