import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { staffClockOutSearch } from "./staff-clock-out.ts";

describe("staffClockOutSearch", () => {
  it("always opens the clock-out verification form", () => {
    assert.deepEqual(staffClockOutSearch(), { tab: "clock-in", verify: "1" });
    assert.deepEqual(staffClockOutSearch("SLH"), {
      tab: "clock-in",
      verify: "1",
      code: "SLH",
    });
    assert.deepEqual(staffClockOutSearch("  "), { tab: "clock-in", verify: "1" });
  });
});

describe("staff clock-out click handlers open the verification form", () => {
  it("green banner CLOCK OUT deep-links with verify=1", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/active-shift-bar.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(src, /staffClockOutSearch/);
    assert.match(src, /onClockOut/);
    assert.doesNotMatch(
      src,
      /search:\s*\{\s*tab:\s*"clock-in"\s*\}/,
      "Client CLOCK OUT must not land on a bare punch-pad clock-in tab",
    );
  });

  it("caseload Return to shift / End shift deep-links with verify=1", () => {
    const hero = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/today-hero.tsx", import.meta.url)),
      "utf8",
    );
    const dual = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/dual-caseload-actions.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(hero, /staffClockOutSearch/);
    assert.match(hero, /Clock out now|Return to shift/);
    assert.match(dual, /staffClockOutSearch/);
    assert.doesNotMatch(
      dual,
      /search=\{\{\s*tab:\s*"clock-in"/,
      "On-the-clock caseload CTA must not omit verify=1",
    );
  });
});
