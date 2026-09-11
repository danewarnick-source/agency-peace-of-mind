import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  ANNUAL_CE_COURSE_FULFILLS_OBLIGATION,
  ANNUAL_CE_COURSE_ID,
  ANNUAL_CE_IN_HIVE_COURSE_ENABLED,
  ANNUAL_CE_OBLIGATION_TITLE,
  isAnnualCeObligationTitle,
} from "./in-hive-training-annual-ce.ts";

describe("annual CE placeholder", () => {
  it("is a Coming-soon shell that does not fulfill the SOW card", () => {
    assert.equal(ANNUAL_CE_COURSE_ID, "pi-annual-ce-12hr");
    assert.equal(ANNUAL_CE_IN_HIVE_COURSE_ENABLED, true);
    assert.equal(ANNUAL_CE_COURSE_FULFILLS_OBLIGATION, false);
    assert.equal(isAnnualCeObligationTitle(ANNUAL_CE_OBLIGATION_TITLE), true);
    assert.equal(isAnnualCeObligationTitle("Annual 12 Hour Continuing Education"), true);
    assert.equal(isAnnualCeObligationTitle("CPR/First Aid Certification — Initial"), false);
  });

  it("does not invent lessons or keys, and the course route shows Coming soon", () => {
    const lib = readFileSync(new URL("./in-hive-training-annual-ce.ts", import.meta.url), "utf8");
    assert.doesNotMatch(lib, /correct:/);
    assert.doesNotMatch(lib, /lessons:/);
    const player = readFileSync(
      new URL("../components/training/in-hive-course-player.tsx", import.meta.url),
      "utf8",
    );
    const route = readFileSync(
      new URL("../routes/dashboard.my-obligations_.course.$instanceId.tsx", import.meta.url),
      "utf8",
    );
    assert.match(player, /Coming soon/);
    assert.match(route, /ANNUAL_CE_COURSE_ID/);
    assert.doesNotMatch(player, /person-centered-training-content\.json/);
  });
});
