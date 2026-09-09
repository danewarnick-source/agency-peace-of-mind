import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PI_HOME_GOLD, PI_HOME_GOLD2, PI_PUBLIC_NAV } from "./pi-homepage.ts";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const PUBLIC_SHELL_FILES = [
  "../routes/contact.tsx",
  "../routes/training.tsx",
  "../routes/pricing.tsx",
  "../components/pi-landing/pi-nectar-page.tsx",
  "../components/pi-landing/pi-about-page.tsx",
  "../routes/terms.tsx",
  "../routes/privacy.tsx",
  "../routes/baa.tsx",
  "../routes/login.tsx",
  "../routes/signup.tsx",
] as const;

describe("public pages share homepage marketing chrome", () => {
  it("keeps one homepage nav order for every non-home public page", () => {
    assert.deepEqual(
      PI_PUBLIC_NAV.map((item) => `${item.label}:${item.to}`),
      ["Nectar:/nectar", "Training:/training", "Pricing:/pricing", "About:/about"],
    );
  });

  it("routes Contact, Training, legal, and auth through PiPublicPage", () => {
    for (const rel of PUBLIC_SHELL_FILES) {
      const text = read(rel);
      assert.match(text, /PiPublicPage/, `${rel} must use PiPublicPage`);
      assert.equal(text.includes('from "@/components/site-header"'), false, `${rel} must not use SiteHeader`);
      assert.equal(text.includes('from "@/components/landing/footer"'), false, `${rel} must not use landing Footer`);
    }
    const forgot = read("../routes/forgot-password.tsx");
    assert.match(forgot, /AuthShell/);
    assert.equal(forgot.includes('from "@/components/site-header"'), false);
  });

  it("header and footer cannot drift from homepage chrome", () => {
    const header = read("../components/pi-landing/pi-public-header.tsx");
    const footer = read("../components/pi-landing/pi-public-footer.tsx");
    const page = read("../components/pi-landing/pi-public-page.tsx");
    assert.match(header, /pi-home-nav/);
    assert.match(header, /pi-home-btn cream sm/);
    assert.match(header, /PI_PUBLIC_NAV/);
    assert.match(header, /PI_HOME_NAV/);
    assert.match(footer, /pi-home-foot/);
    assert.match(footer, /PI_HOME_FOOTER_LINKS/);
    assert.match(footer, /PI_HOME_FOOTER_HCBS/);
    assert.match(page, /pi-landing-root pi-home/);
    assert.match(page, /applyPublicPageScroll/);
    assert.match(header, /hash=""/);
    assert.match(footer, /hash=""/);
    assert.doesNotMatch(header, /btn p sm/);
    assert.doesNotMatch(footer, /PI_FOOTER_LINKS/);
  });

  it("does not put bright yellow back on public marketing CSS", () => {
    const homeCss = read("../components/pi-landing/pi-homepage.css");
    const landingCss = read("../components/pi-landing/pi-landing.css");
    assert.match(homeCss, new RegExp(PI_HOME_GOLD.replace("#", "#")));
    assert.match(homeCss, new RegExp(PI_HOME_GOLD2.replace("#", "#")));
    assert.match(landingCss, /#c4a35a/);
    assert.doesNotMatch(landingCss, /--gold: #c9a227/);
    assert.doesNotMatch(homeCss, /#c9a227/);
    const signup = read("../routes/signup.tsx");
    assert.match(signup, /#3a4553/);
    assert.doesNotMatch(signup, /rgba\(255,255,255,0\.5\)/);
    const contact = read("../components/landing/contact.tsx");
    assert.doesNotMatch(contact, /bg-\[color:var\(--surface-2\)\]/);
    assert.doesNotMatch(contact, /careacademy/);
    assert.match(contact, /pi-home-btn gold/);
  });
});
