import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  applyPublicPageScroll,
  publicHashId,
  resetPublicPageScroll,
  shouldScrollPublicPageToTop,
} from "./pi-public-scroll.ts";

function read(rel: string) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

describe("public page scroll", () => {
  it("treats missing or empty hashes as page-top destinations", () => {
    assert.equal(publicHashId(undefined), "");
    assert.equal(publicHashId(null), "");
    assert.equal(publicHashId(""), "");
    assert.equal(publicHashId("#"), "");
    assert.equal(publicHashId("nectar"), "nectar");
    assert.equal(publicHashId("#pricing"), "pricing");
    assert.equal(shouldScrollPublicPageToTop(""), true);
    assert.equal(shouldScrollPublicPageToTop("#"), true);
    assert.equal(shouldScrollPublicPageToTop(undefined), true);
  });

  it("scrolls to top when a leftover hash has no matching element", () => {
    const ids: Record<string, { scrollIntoView: () => void } | null> = {
      nectar: null,
    };
    const scrolling = { scrollTop: 640, scrollLeft: 8 };
    const previous = globalThis.document;
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => ids[id] ?? null,
        scrollingElement: scrolling,
        documentElement: scrolling,
        body: scrolling,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { scrollTo: (x: number, y: number) => {
        scrolling.scrollLeft = x;
        scrolling.scrollTop = y;
      } },
    });
    try {
      assert.equal(shouldScrollPublicPageToTop("#nectar"), true);
      applyPublicPageScroll("#nectar");
      assert.equal(scrolling.scrollTop, 0);
      assert.equal(scrolling.scrollLeft, 0);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previous });
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }
  });

  it("keeps intentional in-page hashes when the section exists", () => {
    const calls: string[] = [];
    const el = { scrollIntoView: () => calls.push("nectar") };
    const previous = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: (id: string) => (id === "nectar" ? el : null),
        scrollingElement: { scrollTop: 400, scrollLeft: 0 },
        documentElement: { scrollTop: 400, scrollLeft: 0 },
        body: { scrollTop: 400, scrollLeft: 0 },
      },
    });
    try {
      assert.equal(shouldScrollPublicPageToTop("#nectar"), false);
      applyPublicPageScroll("#nectar");
      assert.deepEqual(calls, ["nectar"]);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previous });
    }
  });

  it("resets window and document scroll positions", () => {
    const scrolling = { scrollTop: 880, scrollLeft: 14 };
    const previous = globalThis.document;
    const previousWindow = globalThis.window;
    let scrolledTo: [number, number] | null = null;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        getElementById: () => null,
        scrollingElement: scrolling,
        documentElement: scrolling,
        body: scrolling,
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { scrollTo: (x: number, y: number) => {
        scrolledTo = [x, y];
      } },
    });
    try {
      resetPublicPageScroll();
      assert.equal(scrolling.scrollTop, 0);
      assert.equal(scrolling.scrollLeft, 0);
      assert.deepEqual(scrolledTo, [0, 0]);
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, value: previous });
      Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
    }
  });
});

describe("public chrome wires page-top scroll", () => {
  it("resets scroll on PiPublicPage path change and clears leftover hashes", () => {
    const page = read("../components/pi-landing/pi-public-page.tsx");
    const header = read("../components/pi-landing/pi-public-header.tsx");
    const footer = read("../components/pi-landing/pi-public-footer.tsx");
    const mark = read("../components/pi-landing/pi-mark.tsx");
    const home = read("../components/pi-landing/pi-marketing-page.tsx");
    assert.match(page, /applyPublicPageScroll/);
    assert.match(page, /usePiPublicPageScroll/);
    assert.match(page, /s\.location\.pathname/);
    assert.match(page, /s\.location\.hash/);
    assert.match(header, /hash=\{item.hash\}/);
    assert.match(header, /hash=""/);
    assert.match(footer, /hash=""/);
    assert.match(mark, /hash=""/);
    assert.match(home, /hash="nectar"/);
    assert.match(home, /to="\/contact" hash=""/);
    assert.match(home, /to="\/signup" hash=""/);
  });
});
