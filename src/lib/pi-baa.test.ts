import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PI_LEGAL_NAME } from "./pi-terms.ts";
import { PI_BAA_AGREE_COPY, PI_BAA_INTRO, PI_BAA_SECTIONS, PI_BAA_TITLE, PI_BAA_VERSION } from "./pi-baa.ts";

describe("Provider Interface BAA", () => {
  it("names Provider Interface LLC and has I-agree copy only", () => {
    assert.equal(PI_LEGAL_NAME, "Provider Interface LLC");
    assert.equal(PI_BAA_TITLE, "Business Associate Agreement");
    assert.equal(PI_BAA_VERSION, "2026-09-02");
    assert.match(PI_BAA_AGREE_COPY, /authorized to bind this agency/i);
    assert.match(PI_BAA_AGREE_COPY, /Business Associate Agreement/);
    assert.match(PI_BAA_AGREE_COPY, /on behalf of this agency/i);
    assert.doesNotMatch(PI_BAA_INTRO, /not legal advice|working draft|Hive Certify/i);
    const body = PI_BAA_SECTIONS.flatMap((s) => [s.heading, ...s.paras]).join(" ");
    assert.match(body, /Provider Interface LLC/);
    assert.doesNotMatch(body, /Hive Certify|signature pad|DocuSign/i);
  });

  it("renders I-agree on /baa and the signup checkbox", () => {
    const page = readFileSync(new URL("../routes/baa.tsx", import.meta.url), "utf8");
    const signup = readFileSync(new URL("../routes/signup.tsx", import.meta.url), "utf8");
    assert.match(page, /createFileRoute\("\/baa"\)/);
    assert.match(page, /baa-agree-checkbox/);
    assert.match(page, /PI_BAA_AGREE_COPY/);
    assert.doesNotMatch(page, /Hive Certify|not legal advice|DocuSign|SignatureCanvas/i);
    assert.match(signup, /signup-baa-checkbox/);
    assert.match(signup, /to="\/baa"/);
    assert.match(signup, /authorized to bind this agency/);
  });
});
