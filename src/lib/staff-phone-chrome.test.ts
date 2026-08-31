import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resetStaffPhoneScroll } from "./staff-phone-chrome.ts";

describe("resetStaffPhoneScroll", () => {
  it("sets the nested scroller to the top", () => {
    const el = { scrollTop: 480, scrollLeft: 12 };
    resetStaffPhoneScroll(el as HTMLElement);
    assert.equal(el.scrollTop, 0);
    assert.equal(el.scrollLeft, 0);
  });

  it("accepts a null scroller", () => {
    resetStaffPhoneScroll(null);
  });
});

describe("staff phone leftover search + tab scroll (source)", () => {
  it("caseload search icon stays in a relative wrapper, never static/sticky/fixed", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../components/staff-client-grid.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(src, /data-caseload-search/);
    assert.match(src, /className="relative"/);
    assert.doesNotMatch(src, /relative static/);
    assert.doesNotMatch(src, /sticky top-14/);
    assert.doesNotMatch(
      src,
      /<Search[\s\S]{0,80}(fixed|sticky)/,
      "Search icon must not be fixed/sticky",
    );
  });

  it("staff phone chrome omits the header Ask Nectar search trigger", () => {
    const dash = readFileSync(
      fileURLToPath(new URL("../routes/dashboard.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(dash, /Open NECTAR search/);
    assert.match(
      dash,
      /!isStaffPhoneChrome[\s\S]{0,220}Open NECTAR search/,
      "Open NECTAR search must be gated off staff phone chrome",
    );
  });

  it("staff shell resets the inner scroller on route change", () => {
    const shell = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/staff-mobile-shell.tsx", import.meta.url)),
      "utf8",
    );
    const tabs = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/staff-bottom-tabs.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(shell, /resetStaffPhoneScroll/);
    assert.match(shell, /useLayoutEffect/);
    assert.match(shell, /data-staff-phone-scroller/);
    assert.match(tabs, /to: "\/dashboard"/);
    assert.match(tabs, /to: "\/dashboard\/schedule"/);
  });
});
