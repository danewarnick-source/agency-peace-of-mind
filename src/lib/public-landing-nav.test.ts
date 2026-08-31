import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LANDING_MOBILE_NAV_ID,
  PUBLIC_MARKETING_NAV_CLASS,
  PUBLIC_MOBILE_MENU_BUTTON_CLASS,
  PUBLIC_MOBILE_MENU_MIN_PX,
} from "./public-landing-nav.ts";

describe("public landing hamburger", () => {
  it("keeps a 44px phone hit target that owns its tap", () => {
    assert.equal(PUBLIC_MOBILE_MENU_MIN_PX, 44);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /h-11/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /min-h-\[44px\]/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /min-w-\[44px\]/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /pointer-events-auto/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /z-20/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /touch-manipulation/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /\[&_svg\]:pointer-events-none/);
    assert.match(PUBLIC_MOBILE_MENU_BUTTON_CLASS, /public-mobile-menu-btn/);
  });

  it("keeps the sticky nav above the hero hex layer", () => {
    assert.match(PUBLIC_MARKETING_NAV_CLASS, /z-50/);
    assert.match(PUBLIC_MARKETING_NAV_CLASS, /isolate/);
    assert.match(PUBLIC_MARKETING_NAV_CLASS, /pointer-events-auto/);
    assert.equal(LANDING_MOBILE_NAV_ID, "landing-mobile-nav");
  });
});
