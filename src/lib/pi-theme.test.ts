import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { PI_GRAIN_SVG, PI_THEME } from "./pi-theme.ts";
import { PI_CREAM, PI_GOLD, PI_NAVY, PI_THEME as FROM_LANDING } from "./pi-landing.ts";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("PI theme tokens", () => {
  it("locks the landing token object", () => {
    assert.equal(PI_THEME.navy, "#0a1120");
    assert.equal(PI_THEME.n1, "#0e1729");
    assert.equal(PI_THEME.n2, "#121d33");
    assert.equal(PI_THEME.n3, "#17243d");
    assert.equal(PI_THEME.sideTop, "#121d33");
    assert.equal(PI_THEME.sideBot, "#0a1120");
    assert.equal(PI_THEME.cream, "#f3efe6");
    assert.equal(PI_THEME.c70, "rgba(243, 239, 230, 0.72)");
    assert.equal(PI_THEME.c50, "rgba(243, 239, 230, 0.5)");
    assert.equal(PI_THEME.c30, "rgba(243, 239, 230, 0.3)");
    assert.equal(PI_THEME.c14, "rgba(243, 239, 230, 0.14)");
    assert.equal(PI_THEME.c08, "rgba(243, 239, 230, 0.08)");
    assert.equal(PI_THEME.c04, "rgba(243, 239, 230, 0.04)");
    assert.equal(PI_THEME.gold, "#c9a227");
    assert.equal(PI_THEME.goldSoft, "rgba(201, 162, 39, 0.16)");
    assert.equal(PI_THEME.ok, "#5fae7f");
    assert.equal(PI_THEME.red, "#e08a80");
    assert.equal(PI_THEME.amber, "#d4af37");
    assert.equal(PI_THEME.serif, '"Newsreader", Georgia, serif');
    assert.equal(PI_THEME.sans, '"Inter", system-ui, sans-serif');
    assert.equal(PI_THEME.grainOpacity, 0.045);
    assert.match(PI_THEME.pageGlow, /radial-gradient/);
    assert.match(PI_THEME.cardBg, /#121d33/);
    assert.match(PI_THEME.heroTileBg, /#0c1425/);
    assert.equal(PI_THEME.hairlines.faint, PI_THEME.c08);
    assert.equal(PI_THEME.buttons.primaryFg, PI_THEME.navy);
    assert.deepEqual(PI_THEME.avatarBg, ["#17243d", "#121d33"]);
  });

  it("re-exports from pi-landing so landing and admin cannot drift", () => {
    assert.equal(FROM_LANDING, PI_THEME);
    assert.equal(PI_NAVY, PI_THEME.navy);
    assert.equal(PI_CREAM, PI_THEME.cream);
    assert.equal(PI_GOLD, PI_THEME.gold);
  });

  it("uses the same grain SVG as the landing (feTurbulence .9 / 2 octaves, 160×160)", () => {
    assert.match(PI_GRAIN_SVG, /width='160'/);
    assert.match(PI_GRAIN_SVG, /height='160'/);
    assert.match(PI_GRAIN_SVG, /feTurbulence/);
    assert.match(PI_GRAIN_SVG, /baseFrequency='\.9'/);
    assert.match(PI_GRAIN_SVG, /numOctaves='2'/);
    const css = read("../components/pi-landing/pi-landing.css");
    assert.match(css, /feTurbulence type='fractalNoise' baseFrequency='\.9' numOctaves='2'/);
    assert.match(css, /opacity: 0\.045/);
    assert.match(css, /mix-blend-mode: overlay/);
  });

  it("keeps Newsreader + Inter on the root font link", () => {
    const root = read("../routes/__root.tsx");
    assert.match(root, /family=Newsreader/);
    assert.match(root, /family=Inter/);
  });
});
