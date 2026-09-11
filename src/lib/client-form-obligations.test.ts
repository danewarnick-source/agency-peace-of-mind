import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  CLIENT_SPECIFIC_OBLIGATION_TITLE,
  PCT_CLIENT_OBLIGATION_TITLE,
  PCT_HIRE_COURSE_TITLE,
  SEI_SUPPORT_STRATEGIES_UPI_TITLE,
  SUPPORT_STRATEGIES_OBLIGATION_TITLE,
  clientFormKindForTitle,
  clientFormTitleForKind,
  isClientFormObligationTitle,
  isRetiredPerClientPctTitle,
} from "./client-form-obligations.ts";

describe("clientFormKindForTitle", () => {
  it("maps the live per-client form duties", () => {
    assert.equal(clientFormKindForTitle(CLIENT_SPECIFIC_OBLIGATION_TITLE), "person_specific");
    assert.equal(clientFormKindForTitle("Client-Specific Training — Jane Doe"), "person_specific");
    assert.equal(clientFormKindForTitle(SUPPORT_STRATEGIES_OBLIGATION_TITLE), "support_strategies");
    assert.equal(clientFormKindForTitle("Support Strategies — Jane Doe"), "support_strategies");
  });

  it("does not treat retired per-client PCT as a live client form", () => {
    assert.equal(isRetiredPerClientPctTitle(PCT_CLIENT_OBLIGATION_TITLE), true);
    assert.equal(isRetiredPerClientPctTitle("Person-Centered Thinking — Jane Doe"), true);
    assert.equal(clientFormKindForTitle(PCT_CLIENT_OBLIGATION_TITLE), null);
    assert.equal(clientFormKindForTitle("Person-Centered Thinking — Jane Doe"), null);
    assert.equal(isClientFormObligationTitle(PCT_CLIENT_OBLIGATION_TITLE), false);
  });

  it("does not treat the hire-level PCT course as the per-client form", () => {
    assert.equal(isRetiredPerClientPctTitle(PCT_HIRE_COURSE_TITLE), false);
    assert.equal(clientFormKindForTitle(PCT_HIRE_COURSE_TITLE), null);
    assert.equal(isClientFormObligationTitle(PCT_HIRE_COURSE_TITLE), false);
  });

  it("does not treat SEI UPI support-strategy entry as the staff form", () => {
    assert.equal(clientFormKindForTitle(SEI_SUPPORT_STRATEGIES_UPI_TITLE), null);
    assert.equal(isClientFormObligationTitle(SEI_SUPPORT_STRATEGIES_UPI_TITLE), false);
  });

  it("round-trips live kind → catalog title", () => {
    assert.equal(clientFormKindForTitle(clientFormTitleForKind("person_specific")), "person_specific");
    assert.equal(
      clientFormKindForTitle(clientFormTitleForKind("support_strategies")),
      "support_strategies",
    );
    assert.equal(isRetiredPerClientPctTitle(clientFormTitleForKind("person_centered")), true);
    assert.equal(clientFormKindForTitle(clientFormTitleForKind("person_centered")), null);
  });

  it("does not seed or catalog the retired per-client PCT duty", () => {
    const standing = readFileSync(new URL("./standing-sow-duties.ts", import.meta.url), "utf8");
    const catalog = readFileSync(new URL("./sow-obligation-catalog.ts", import.meta.url), "utf8");
    assert.doesNotMatch(standing, /title: "Person-Centered Thinking — \[Client Name\]"/);
    assert.doesNotMatch(catalog, /title: "Person-Centered Thinking — \[Client Name\]"/);
    assert.match(catalog, /title: "Person-Centered Thinking and Practices Training"/);
  });

  it("has no createPersonCenteredProfile server fn", () => {
    const fns = readFileSync(
      new URL("./client-specific-training.functions.ts", import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(fns, /export const createPersonCenteredProfile/);
    assert.doesNotMatch(fns, /training_type: "person_centered"/);
    assert.match(fns, /getStaffClientSpecificTraining/);
    assert.match(fns, /completeClientSpecificTraining/);
  });
});
