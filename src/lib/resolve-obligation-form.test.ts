import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFormUuid,
  isUnlinkedFormDuty,
  resolveObligationFormId,
} from "./resolve-obligation-form.ts";

const FORMS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Medication Error Report" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Incident Follow-up" },
];

describe("resolveObligationFormId", () => {
  it("keeps a real UUID", () => {
    assert.equal(
      resolveObligationFormId("11111111-1111-4111-8111-111111111111", FORMS, "Other"),
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("does not treat literal null as an id", () => {
    assert.equal(isFormUuid(null), false);
    assert.equal(isFormUuid("null"), false);
    assert.equal(isFormUuid(FORMS[0].id), true);
    assert.equal(resolveObligationFormId(null, FORMS, "Medication Error Report"), FORMS[0].id);
    assert.equal(resolveObligationFormId("null", FORMS, "Unknown duty"), null);
  });

  it("returns null when nothing matches", () => {
    assert.equal(resolveObligationFormId(null, FORMS, "Unrelated obligation"), null);
  });

  it("flags form duties with no published UUID as unactionable", () => {
    assert.equal(isUnlinkedFormDuty({ evidence_type: "form", linked_form_id: null }), true);
    assert.equal(isUnlinkedFormDuty({ evidence_type: "form", linked_form_id: "null" }), true);
    assert.equal(isUnlinkedFormDuty({ evidence_type: "form", linked_form_id: FORMS[0].id }), false);
    assert.equal(isUnlinkedFormDuty({ evidence_type: "attestation", linked_form_id: null }), false);
  });
});
