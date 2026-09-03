import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PI_FORBIDDEN_MARKETING,
  PI_FORBIDDEN_PUBLIC_PRICES,
  PI_FOUNDING_QUIET,
  PI_HEADLINE,
  PI_HERO_SUPPORT,
  PI_LIST_MINIMUM_DOLLARS,
  PI_LIST_MINIMUM_LINE,
  PI_LIST_PER_CLIENT_DOLLARS,
  PI_LIST_PRICE_CONTRAST,
  PI_LIST_PRICE_DISPLAY,
  PI_LIST_PRICE_LEAD,
  PI_PAGE_DESCRIPTION,
  PI_PAGE_TITLE,
  PI_SIGNUP_PRICE_LINE,
  PI_SUBHEAD,
  PI_TRAINING_ADDONS,
  PI_WORDMARK,
} from "./pi-landing.ts";

const PUBLIC_FILES = [
  new URL("../routes/index.tsx", import.meta.url),
  new URL("../routes/pricing.tsx", import.meta.url),
  new URL("../routes/signup.tsx", import.meta.url),
  new URL("../routes/training.tsx", import.meta.url),
  new URL("../routes/terms.tsx", import.meta.url),
  new URL("../routes/baa.tsx", import.meta.url),
  new URL("../components/pi-landing/pi-marketing-page.tsx", import.meta.url),
  new URL("../components/pi-landing/pi-pricing.tsx", import.meta.url),
  new URL("../components/pi-landing/pi-product-shots.tsx", import.meta.url),
  new URL("../components/pi-landing/pi-public-header.tsx", import.meta.url),
  new URL("../components/pi-landing/pi-public-footer.tsx", import.meta.url),
];

function read(url: URL) {
  return readFileSync(url, "utf8");
}

describe("Provider Interface marketing homepage", () => {
  it("locks the dusk copy and names Nectar", () => {
    assert.equal(PI_WORDMARK, "PROVIDER INTERFACE");
    assert.equal(PI_HEADLINE, "The day got smaller.");
    assert.equal(PI_SUBHEAD, "Go home. It stays standing.");
    assert.match(PI_HERO_SUPPORT, /Nectar/);
    assert.match(PI_PAGE_TITLE, /Provider Interface/);
    assert.match(PI_PAGE_DESCRIPTION, /Nectar/);
  });

  it("posts only the locked list price", () => {
    assert.equal(PI_LIST_PER_CLIENT_DOLLARS, 69);
    assert.equal(PI_LIST_MINIMUM_DOLLARS, 350);
    assert.equal(PI_LIST_PRICE_DISPLAY, "$69");
    assert.equal(PI_LIST_MINIMUM_LINE, "$350 / month minimum");
    assert.equal(PI_LIST_PRICE_LEAD, "The list price is the price.");
    assert.equal(PI_LIST_PRICE_CONTRAST, "No setup fee. No add-ons for Nectar. Training optional.");
    assert.match(PI_SIGNUP_PRICE_LINE, /\$69 per client \/ month \(\$350 minimum\)/);
    assert.match(PI_FOUNDING_QUIET, /first five agencies/);
    assert.doesNotMatch(PI_FOUNDING_QUIET, /\$/);
    assert.deepEqual(
      PI_TRAINING_ADDONS.map((row) => row.price),
      ["$100", "$75", "$200", "$300"],
    );
  });

  it("scrolls through real sections and does not reuse Hive marketing chrome", () => {
    const page = read(new URL("../routes/index.tsx", import.meta.url));
    const landing = read(new URL("../components/pi-landing/pi-marketing-page.tsx", import.meta.url));
    const pricing = read(new URL("../components/pi-landing/pi-pricing.tsx", import.meta.url));
    const shots = read(new URL("../components/pi-landing/pi-product-shots.tsx", import.meta.url));
    assert.match(page, /PiMarketingPage/);
    assert.match(landing, /what-you-get/);
    assert.match(landing, /PiProductShots/);
    assert.match(landing, /PiPricingSection/);
    assert.match(landing, /to="\/login"/);
    assert.match(landing, /to="\/contact"/);
    assert.match(shots, /Nectar/);
    assert.match(pricing, /PI_LIST_PRICE_DISPLAY/);
    assert.match(pricing, /PI_TRAINING_ADDONS/);
    assert.match(pricing, /PI_LIST_PRICE_CONTRAST/);
    assert.doesNotMatch(pricing, /FOUNDING_PER_STAFF_CENTS|LIST_VOLUME_TIERS|ANNUAL_DISCOUNT/);
    assert.doesNotMatch(landing, /PublicLandingHeader|HexBackdrop|HeroPhone|HiveWordmark|Honeycomb|hivecertify/);
    for (const word of PI_FORBIDDEN_MARKETING) {
      assert.equal(landing.includes(word), false, `homepage must not mention ${word}`);
      assert.equal(pricing.includes(word), false, `pricing must not mention ${word}`);
      assert.equal(shots.includes(word), false, `product shots must not mention ${word}`);
    }
    assert.equal(PI_FORBIDDEN_MARKETING.includes("Nectar" as never), false);
  });

  it("signup walk posts list price, optional training, and no True North placeholder", () => {
    const signup = read(new URL("../routes/signup.tsx", import.meta.url));
    assert.match(signup, /PI_SIGNUP_PRICE_LINE|PI_LIST_PRICE_DISPLAY/);
    assert.match(signup, /Skip training/);
    assert.match(signup, /4242 4242 4242 4242/);
    assert.match(signup, /pricingModel: "pi_list"/);
    assert.match(signup, /fromSignup: true/);
    assert.match(signup, /signup-tos-checkbox/);
    assert.match(signup, /signup-baa-checkbox/);
    assert.match(signup, /to="\/terms"/);
    assert.match(signup, /to="\/baa"/);
    assert.match(signup, /Add a person/);
    assert.match(signup, /signup-training-add/);
    assert.doesNotMatch(signup, /True North Supports/);
    assert.doesNotMatch(signup, /founding/i);
  });

  it("keeps leftover staff dollars off signup, paywall, and Hive Exec copy", () => {
    const leftovers = ["$125", "$79", "$500", "$299"];
    const files = [
      new URL("../routes/signup.tsx", import.meta.url),
      new URL("../routes/billing-locked.tsx", import.meta.url),
      new URL("../components/billing/hive-subscription-panel.tsx", import.meta.url),
      new URL("../routes/dashboard.hive-exec.plans.tsx", import.meta.url),
      new URL("../routes/dashboard.hive-exec.$orgId.tsx", import.meta.url),
    ];
    for (const file of files) {
      const text = read(file);
      for (const banned of leftovers) {
        assert.equal(text.includes(banned), false, `${file.pathname} must not post ${banned}`);
      }
    }
  });

  it("keeps old staff prices and True North-free lines off public surfaces", () => {
    for (const file of PUBLIC_FILES) {
      const text = read(file);
      for (const banned of PI_FORBIDDEN_PUBLIC_PRICES) {
        assert.equal(text.includes(banned), false, `${file.pathname} must not post ${banned}`);
      }
    }
  });

  it("keeps the π mark geometric: straight bar, shorter left leg", () => {
    const mark = read(new URL("../components/pi-landing/pi-mark.tsx", import.meta.url));
    assert.match(mark, /M6 10H42/);
    assert.match(mark, /M15 10V28/);
    assert.match(mark, /M33 10V40/);
    assert.doesNotMatch(mark, /polygon|hexagon|Hexagon/i);
  });
});
