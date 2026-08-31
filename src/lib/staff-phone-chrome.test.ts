import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  resetStaffPhoneScroll,
  shouldUnmountDuplicateStaffOutlet,
} from "./staff-phone-chrome.ts";

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
  it("caseload search icon is in-flow flex, never absolute/static/sticky/fixed", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../components/staff-client-grid.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(src, /data-caseload-search/);
    assert.match(src, /flex h-11 w-full items-center/);
    assert.doesNotMatch(src, /relative static/);
    assert.doesNotMatch(src, /sticky top-14/);
    assert.doesNotMatch(
      src,
      /<Search[^>]*absolute/,
      "Search icon must stay in flex flow",
    );
  });

  it("unmounts the duplicate staff Outlet only on a phone staff chrome", () => {
    assert.equal(shouldUnmountDuplicateStaffOutlet(false), false);
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
    assert.match(dash, /hideDuplicateStaffOutlet/);
    assert.match(dash, /shouldUnmountDuplicateStaffOutlet/);
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

  it("staff top bar is a single row with no nested Nectar search", () => {
    const top = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/staff-top-bar.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(top, /data-staff-top-bar/);
    assert.doesNotMatch(top, /NectarSearchBar/);
  });

  it("clocked-in bar sits on the shared offset above the tab bar", () => {
    const bar = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/active-shift-bar.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(bar, /STAFF_CLOCK_BAR_OFFSET_CSS/);
    assert.match(bar, /data-staff-clock-bar/);
    assert.doesNotMatch(bar, /bottom-\[56px\]/);
  });

  it("caseload does not mount overdue or CE-hours pills", () => {
    const home = readFileSync(
      fileURLToPath(new URL("../routes/dashboard.index.tsx", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(home, /AttentionStrip/);
    assert.doesNotMatch(home, /form overdue|CE hrs left/);
  });

  it("session PIN lock is gone", () => {
    const workspace = readFileSync(
      fileURLToPath(new URL("../routes/dashboard.workspace.$clientId.tsx", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(workspace, /IdlePinLock/);
    assert.doesNotMatch(workspace, /idle-pin-lock/);
  });

  it("Ask NECTAR uses one chrome title and never prints AI error (status)", () => {
    const chat = readFileSync(
      fileURLToPath(new URL("../components/staff-mobile/ask-nectar-staff.tsx", import.meta.url)),
      "utf8",
    );
    const fn = readFileSync(
      fileURLToPath(new URL("./nectar-staff.functions.ts", import.meta.url)),
      "utf8",
    );
    assert.doesNotMatch(chat, /Ask NECTAR · Staff/);
    assert.doesNotMatch(chat, /Staff assistant/);
    assert.match(chat, /staffNectarFailureMessage/);
    assert.match(fn, /staffNectarFailureMessage/);
    assert.doesNotMatch(fn, /AI error \(/);
  });
});
