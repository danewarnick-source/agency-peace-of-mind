import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { sowCatalogEntryByKey } from "../sow-obligation-catalog.ts";
import {
  AWARDED_CODE_CHOICES,
  AWARDED_SERVICE_CODES_FACT_KEY,
  LIVE_PATH_SETUP_QUESTIONS,
  agencyServiceCodeCatalogKeys,
  awardedCodesUnanswered,
  setupQuestionAsksWhetherSectionApplies,
} from "./setup-facts.ts";

describe("live-path setup questions", () => {
  it("asks concrete facts for every connected path — never whether a section applies", () => {
    const paths = LIVE_PATH_SETUP_QUESTIONS.map((q) => q.path).sort();
    assert.deepEqual(paths, [
      "abi",
      "acre_sed",
      "acre_sei",
      "acre_sjd",
      "awarded_codes",
      "billing_1056",
      "client_specific",
      "cmp_cms",
      "cmp_cms_monthly",
      "code_of_conduct",
      "cpr",
      "designated_benefits",
      "evv",
      "hhs_daily",
      "org_profile",
      "orientation",
      "sei_monthly",
      "service_notes",
      "sjd_discovery",
      "sjd_monthly",
      "transport",
      "usor_sei",
    ]);
    for (const q of LIVE_PATH_SETUP_QUESTIONS) {
      assert.equal(setupQuestionAsksWhetherSectionApplies(q.question), false, q.question);
      assert.doesNotMatch(q.question, /does\s*§/);
      for (const key of q.dutyKeys) {
        assert.ok(sowCatalogEntryByKey(key), `missing catalog entry for ${key}`);
      }
    }
  });

  it("treats empty awarded codes as unanswered, not known-none", () => {
    assert.equal(awardedCodesUnanswered([]), true);
    assert.equal(awardedCodesUnanswered(null), true);
    assert.equal(awardedCodesUnanswered(["HHS", "SEI"]), false);
    assert.equal(AWARDED_SERVICE_CODES_FACT_KEY, "awarded_service_codes");
    assert.ok(AWARDED_CODE_CHOICES.includes("SEI"));
  });

  it("reuses the one shared service-code registry instead of a second questionnaire", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../routes/dashboard.nectar-company-profile.tsx", import.meta.url)),
      "utf8",
    );
    // The company-profile page must import its code choices from the same
    // registry AWARDED_CODE_CHOICES is built from — not hand-roll its own
    // list (that drift is exactly what caused the original six-code gap).
    assert.match(src, /awardableServiceCodeChoices/);
    assert.match(src, /@\/lib\/service-code-registry/);
    assert.doesNotMatch(src, /does this (duty|obligation|section) apply/i);
  });

  it("AWARDED_CODE_CHOICES is the full service-code registry, not a hand-picked subset", () => {
    assert.ok(AWARDED_CODE_CHOICES.length >= 40, "expected the full registry, not a shortlist");
    for (const code of ["HHS", "SLN", "SLH", "SEI", "DSI", "RHS", "PPS", "PBA"]) {
      assert.ok(AWARDED_CODE_CHOICES.includes(code), `missing ${code}`);
    }
  });

  it("does not invent an SEI org fact_key for agency code rows", () => {
    assert.ok(agencyServiceCodeCatalogKeys().includes("sei_monthly_summary_upi"));
    assert.equal(agencyServiceCodeCatalogKeys().includes("acre_sei"), false);
  });
});
