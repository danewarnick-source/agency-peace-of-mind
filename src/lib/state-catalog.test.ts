import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { allSowCatalogEntries } from "./sow-obligation-catalog.ts";
import {
  WY_EMPTY_SHELL_MESSAGE,
  catalogForState,
  emptyCatalogShellMessage,
  isCatalogStateCode,
  normalizeStateCode,
} from "./state-catalog.ts";

describe("catalogForState", () => {
  it("returns the full UT pack and empty ID/WY shells", () => {
    const ut = catalogForState("UT");
    assert.equal(ut.length, allSowCatalogEntries().length);
    assert.ok(ut.length > 0);
    assert.equal(
      ut.every((e) => e.state_code === "UT"),
      true,
    );
    assert.deepEqual(catalogForState("ut"), ut);
    assert.deepEqual(catalogForState("WY"), []);
    assert.deepEqual(catalogForState("wy"), []);
    assert.deepEqual(catalogForState("ID"), []);
    assert.deepEqual(catalogForState("CO"), []);
    assert.deepEqual(catalogForState(null), []);
    assert.deepEqual(catalogForState(""), []);
    assert.deepEqual(catalogForState("Utah"), []);
  });

  it("does not invent Wyoming or Idaho catalog keys", () => {
    assert.equal(catalogForState("WY").length, 0);
    assert.equal(catalogForState("ID").length, 0);
    assert.equal(
      catalogForState("WY").some((e) => e.state_code === "UT"),
      false,
    );
  });
});

describe("AUDIT_INSTRUMENTS ID/WY empty", () => {
  it("declares UT plus empty ID and WY shells", () => {
    const auditSrc = readFileSync(new URL("./dspd-audit-tool.ts", import.meta.url), "utf8");
    assert.match(
      auditSrc,
      /export const AUDIT_INSTRUMENTS = \{\s*UT: DSPD_AUDIT_ITEMS,\s*ID: \[\] as const,\s*WY: \[\] as const,/s,
    );
  });
});

describe("empty WY shell message", () => {
  it("names Wyoming and does not apply Utah duties", () => {
    assert.match(WY_EMPTY_SHELL_MESSAGE, /Wyoming/);
    assert.match(WY_EMPTY_SHELL_MESSAGE, /do not apply/i);
    assert.equal(emptyCatalogShellMessage("WY"), WY_EMPTY_SHELL_MESSAGE);
    assert.equal(emptyCatalogShellMessage("wy"), WY_EMPTY_SHELL_MESSAGE);
    assert.equal(emptyCatalogShellMessage("UT"), null);
    assert.equal(emptyCatalogShellMessage(null), null);
    assert.match(emptyCatalogShellMessage("ID") ?? "", /ID does not have a compliance catalog/);
    assert.equal(WY_EMPTY_SHELL_MESSAGE.includes("😀"), false);
    assert.equal(WY_EMPTY_SHELL_MESSAGE.includes("⚠"), false);
  });
});

describe("state code helpers", () => {
  it("normalizes two-letter codes and rejects junk", () => {
    assert.equal(normalizeStateCode(" wy "), "WY");
    assert.equal(normalizeStateCode("id"), "ID");
    assert.equal(normalizeStateCode("Utah"), null);
    assert.equal(normalizeStateCode("WYO"), null);
    assert.equal(isCatalogStateCode("UT"), true);
    assert.equal(isCatalogStateCode("WY"), true);
    assert.equal(isCatalogStateCode("ID"), true);
    assert.equal(isCatalogStateCode("CO"), false);
  });
});
