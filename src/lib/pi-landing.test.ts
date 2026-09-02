import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PI_FORBIDDEN_MARKETING,
  PI_HEADLINE,
  PI_HERO_SUPPORT,
  PI_PAGE_DESCRIPTION,
  PI_PAGE_TITLE,
  PI_SUBHEAD,
  PI_WORDMARK,
} from "./pi-landing.ts";

describe("Provider Interface marketing homepage", () => {
  it("locks the dusk copy and names Nectar", () => {
    assert.equal(PI_WORDMARK, "PROVIDER INTERFACE");
    assert.equal(PI_HEADLINE, "The day got smaller.");
    assert.equal(PI_SUBHEAD, "Go home. It stays standing.");
    assert.match(PI_HERO_SUPPORT, /Nectar/);
    assert.match(PI_PAGE_TITLE, /Provider Interface/);
    assert.match(PI_PAGE_DESCRIPTION, /Nectar/);
  });

  it("scrolls through real sections and does not reuse Hive marketing chrome", () => {
    const page = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    const landing = readFileSync(
      new URL("../components/pi-landing/pi-marketing-page.tsx", import.meta.url),
      "utf8",
    );
    const pricing = readFileSync(new URL("../components/pi-landing/pi-pricing.tsx", import.meta.url), "utf8");
    const shots = readFileSync(
      new URL("../components/pi-landing/pi-product-shots.tsx", import.meta.url),
      "utf8",
    );
    assert.match(page, /PiMarketingPage/);
    assert.match(landing, /what-you-get/);
    assert.match(landing, /PiProductShots/);
    assert.match(landing, /PiPricingSection/);
    assert.match(landing, /to="\/login"/);
    assert.match(shots, /Nectar/);
    assert.match(pricing, /FOUNDING_PER_STAFF_CENTS/);
    assert.match(pricing, /LIST_VOLUME_TIERS/);
    assert.match(pricing, /TRAINING_PRICE_CENTS/);
    assert.doesNotMatch(landing, /PublicLandingHeader|HexBackdrop|HeroPhone|HiveWordmark|Honeycomb|hivecertify/);
    for (const word of PI_FORBIDDEN_MARKETING) {
      assert.equal(landing.includes(word), false, `homepage must not mention ${word}`);
      assert.equal(pricing.includes(word), false, `pricing must not mention ${word}`);
      assert.equal(shots.includes(word), false, `product shots must not mention ${word}`);
    }
    assert.equal(PI_FORBIDDEN_MARKETING.includes("Nectar" as never), false);
  });

  it("keeps the π mark geometric: straight bar, shorter left leg", () => {
    const mark = readFileSync(new URL("../components/pi-landing/pi-mark.tsx", import.meta.url), "utf8");
    assert.match(mark, /M6 10H42/);
    assert.match(mark, /M15 10V28/);
    assert.match(mark, /M33 10V40/);
    assert.doesNotMatch(mark, /polygon|hexagon|Hexagon/i);
  });
});
