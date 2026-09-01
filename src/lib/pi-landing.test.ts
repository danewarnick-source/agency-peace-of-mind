import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  PI_FORBIDDEN_MARKETING,
  PI_HEADLINE,
  PI_PAGE_DESCRIPTION,
  PI_PAGE_TITLE,
  PI_SUBHEAD,
  PI_WORDMARK,
} from "./pi-landing.ts";

describe("Provider Interface dusk homepage", () => {
  it("locks the dusk copy", () => {
    assert.equal(PI_WORDMARK, "PROVIDER INTERFACE");
    assert.equal(PI_HEADLINE, "The day got smaller.");
    assert.equal(PI_SUBHEAD, "Go home. It stays standing.");
    assert.match(PI_PAGE_TITLE, /Provider Interface/);
    assert.match(PI_PAGE_DESCRIPTION, /Go home/);
  });

  it("does not reuse the old Hive marketing files or forbidden words", () => {
    const page = readFileSync(new URL("../routes/index.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(page, /PublicLandingHeader|HexBackdrop|HeroPhone|product-frames|HiveWordmark|Honeycomb/);
    for (const word of PI_FORBIDDEN_MARKETING) {
      assert.equal(page.includes(word), false, `homepage must not mention ${word}`);
    }
  });

  it("keeps the π mark geometric: straight bar, shorter left leg", () => {
    const mark = readFileSync(new URL("../components/pi-landing/pi-mark.tsx", import.meta.url), "utf8");
    assert.match(mark, /M6 10H42/);
    assert.match(mark, /M15 10V28/);
    assert.match(mark, /M33 10V40/);
    assert.doesNotMatch(mark, /polygon|hexagon|Hexagon/i);
  });
});
