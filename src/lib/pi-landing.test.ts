import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PI_CONTRACT_OBLIGATION_COUNT,
  PI_CTA_HEADLINE,
  PI_FORBIDDEN_MARKETING,
  PI_FORBIDDEN_PUBLIC_PRICES,
  PI_FOUNDING_QUIET,
  PI_GET_STARTED,
  PI_HEADLINE,
  PI_HEADLINE_EMPHASIS,
  PI_HERO_SUPPORT,
  PI_LIST_MINIMUM_DOLLARS,
  PI_LIST_MINIMUM_LINE,
  PI_LIST_PER_CLIENT_DOLLARS,
  PI_LIST_PRICE_CONTRAST,
  PI_LIST_PRICE_DISPLAY,
  PI_LIST_PRICE_LEAD,
  PI_NAV_WHY,
  PI_NECTAR_SUB,
  PI_PAGE_DESCRIPTION,
  PI_PAGE_TITLE,
  PI_SIGNUP_PRICE_LINE,
  PI_SUBHEAD,
  PI_TRAINING_ADDONS,
  PI_WHAT_IS_LEAD,
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
  it("locks Dane's PI landing copy and names Nectar", () => {
    assert.equal(PI_WORDMARK, "PROVIDER INTERFACE");
    assert.equal(PI_HEADLINE, "Run the agency.");
    assert.equal(PI_HEADLINE_EMPHASIS, "Stop chasing it.");
    assert.match(PI_SUBHEAD, /already set up the day you sign in/);
    assert.equal(PI_HERO_SUPPORT, PI_SUBHEAD);
    assert.equal(PI_NAV_WHY, "Why PI");
    assert.equal(PI_WHAT_IS_LEAD, "Provider Interface.");
    assert.match(PI_NECTAR_SUB, /Nectar is in the price/);
    assert.equal(PI_GET_STARTED, "Get started with PI");
    assert.equal(PI_CTA_HEADLINE, "Open PI Monday. It's already standing.");
    assert.match(PI_PAGE_TITLE, /Provider Interface/);
    assert.match(PI_PAGE_TITLE, /Stop chasing it/);
    assert.match(PI_PAGE_DESCRIPTION, /DSPD contract requirements/);
  });

  it("posts only the locked list price", () => {
    assert.equal(PI_LIST_PER_CLIENT_DOLLARS, 69);
    assert.equal(PI_LIST_MINIMUM_DOLLARS, 350);
    assert.equal(PI_CONTRACT_OBLIGATION_COUNT, 41);
    assert.equal(PI_LIST_PRICE_DISPLAY, "$69");
    assert.equal(PI_LIST_MINIMUM_LINE, "$350 / month minimum");
    assert.equal(PI_LIST_PRICE_LEAD, "The list price is the price.");
    assert.equal(PI_LIST_PRICE_CONTRAST, "No setup fee. No add-ons for Nectar. Training optional.");
    assert.match(PI_SIGNUP_PRICE_LINE, /\$69 per client \/ month \(\$350 minimum\)/);
    assert.match(PI_FOUNDING_QUIET, /[Ff]irst five agencies/);
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
    const header = read(new URL("../components/pi-landing/pi-public-header.tsx", import.meta.url));
    const root = read(new URL("../routes/__root.tsx", import.meta.url));
    assert.match(root, /family=Newsreader/);
    assert.match(root, /0,6\.\.72,300/);
    assert.match(page, /PiMarketingPage/);
    assert.doesNotMatch(landing, /what-you-get/);
    assert.doesNotMatch(landing, /PiProductShots/);
    assert.doesNotMatch(landing, /PI_WHAT_YOU_GET/);
    assert.doesNotMatch(landing, /DuskDeskStill|PiPricingSection/);
    assert.match(landing, /id="why"/);
    assert.match(landing, /id="pricing"/);
    assert.match(landing, /to="\/signup"/);
    assert.match(landing, /to="\/contact"/);
    assert.match(landing, /PI_LIST_PRICE_DISPLAY/);
    assert.match(landing, /PI_LANDING_INCLUDED/);
    assert.doesNotMatch(header, /What you get/);
    assert.doesNotMatch(header, /The office/);
    assert.match(header, /PI_NAV_LINKS/);
    assert.match(header, /to="\/login"/);
    const copy = read(new URL("./pi-landing.ts", import.meta.url));
    assert.match(copy, /\/#why/);
    assert.match(copy, /\/#pricing/);
    assert.match(copy, /to: "\/training"/);
    assert.match(shots, /Nectar/);
    assert.match(pricing, /PI_LIST_PRICE_DISPLAY/);
    assert.match(pricing, /PI_TRAINING_ADDONS/);
    assert.match(pricing, /PI_TRAINING_QUIET/);
    assert.match(pricing, /PI_LIST_PRICE_CONTRAST/);
    assert.match(pricing, /compact/);
    assert.doesNotMatch(pricing, /FOUNDING_PER_STAFF_CENTS|LIST_VOLUME_TIERS|ANNUAL_DISCOUNT/);
    assert.doesNotMatch(landing, /PublicLandingHeader|HexBackdrop|HeroPhone|HiveWordmark|Honeycomb|hivecertify/);
    for (const word of PI_FORBIDDEN_MARKETING) {
      assert.equal(landing.includes(word), false, `homepage must not mention ${word}`);
      assert.equal(pricing.includes(word), false, `pricing must not mention ${word}`);
      assert.equal(shots.includes(word), false, `product shots must not mention ${word}`);
    }
    assert.equal(PI_FORBIDDEN_MARKETING.includes("Nectar" as never), false);
  });

  it("does not mount the old dusk laptop mock on the public landing", () => {
    const landing = read(new URL("../components/pi-landing/pi-marketing-page.tsx", import.meta.url));
    assert.doesNotMatch(landing, /DuskDeskStill|DuskPeopleScreen|PI_DIFFERENCE_HEADLINE/);
    assert.match(landing, /PI_WHAT_IS_LEAD/);
    assert.match(landing, /PI_NECTAR_BEFORE_QUOTE/);
  });

  it("signup walk posts list price, optional training, and no True North placeholder", () => {
    const signup = read(new URL("../routes/signup.tsx", import.meta.url));
    assert.match(signup, /PI_SIGNUP_PRICE_LINE|PI_LIST_PRICE_DISPLAY/);
    assert.match(signup, /Skip training/);
    assert.match(signup, /Just need training\? Buy classes without the office/);
    assert.match(signup, /signup-training-only-link/);
    assert.match(signup, /to="\/training"/);
    const account = signup.slice(
      signup.indexOf("function Step1Account"),
      signup.indexOf("function Step3Business"),
    );
    const training = signup.slice(signup.indexOf("function Step5Training"));
    assert.doesNotMatch(account, /Just need training\?/);
    assert.match(training, /Just need training\? Buy classes without the office\./);
    assert.match(training, /to="\/training"/);
    assert.match(training, /Skip training/);
    assert.match(signup, /4242 4242 4242 4242/);
    assert.match(signup, /pricingModel: "pi_list"/);
    assert.match(signup, /fromSignup: true/);
    assert.match(signup, /signup-tos-checkbox/);
    assert.match(signup, /signup-baa-checkbox/);
    assert.match(signup, /href="\/terms"/);
    assert.match(signup, /href="\/baa"/);
    assert.match(signup, /target="_blank"/);
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

  it("keeps the π mark geometric: three squared rects in a 36 viewBox", () => {
    const mark = read(new URL("../components/pi-landing/pi-mark.tsx", import.meta.url));
    assert.match(mark, /viewBox="0 0 36 36"/);
    assert.match(mark, /x="4"/);
    assert.match(mark, /y="4"/);
    assert.match(mark, /width="28"/);
    assert.match(mark, /height="5"/);
    assert.match(mark, /x="9"/);
    assert.match(mark, /height="23"/);
    assert.match(mark, /x="22"/);
    assert.match(mark, /variant === "hero"/);
    assert.doesNotMatch(mark, /M6 10H42/);
    assert.doesNotMatch(mark, /polygon|hexagon|Hexagon/i);
  });
});
