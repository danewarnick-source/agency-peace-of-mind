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
      "acre_sei",
      "awarded_codes",
      "billing_1056",
      "client_specific",
      "code_of_conduct",
      "cpr",
      "org_profile",
      "orientation",
      "transport",
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

  it("reuses the company-profile code set instead of a second questionnaire", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../../routes/dashboard.nectar-company-profile.tsx", import.meta.url)),
      "utf8",
    );
    for (const code of AWARDED_CODE_CHOICES) {
      assert.match(src, new RegExp(`"${code}"`));
    }
    assert.doesNotMatch(src, /does this (duty|obligation|section) apply/i);
  });

  it("does not invent an SEI org fact_key for agency code rows", () => {
    assert.ok(agencyServiceCodeCatalogKeys().includes("sei_monthly_summary_upi"));
    assert.equal(agencyServiceCodeCatalogKeys().includes("acre_sei"), false);
  });
});
