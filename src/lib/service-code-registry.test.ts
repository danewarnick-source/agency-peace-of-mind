import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVV_SERVICE_CODES } from "./evv-codes.ts";
import { allSowCatalogEntries } from "./sow-obligation-catalog.ts";
import {
  SERVICE_CODE_REGISTRY,
  awardableServiceCodeChoices,
  normalizeServiceCodes,
  reconcileServiceCodes,
  serviceCodeEntry,
  serviceCodeLabel,
} from "./service-code-registry.ts";

describe("service code registry", () => {
  it("is the full canonical code list — same size as evv-codes.ts, not a shortlist", () => {
    assert.equal(SERVICE_CODE_REGISTRY.length, EVV_SERVICE_CODES.length);
    assert.ok(SERVICE_CODE_REGISTRY.length >= 40);
    for (const code of ["PPS", "PBA", "RHS", "HHS", "SLN", "SLH", "SEI", "DSI"]) {
      assert.ok(serviceCodeEntry(code), `missing ${code} in the registry`);
    }
  });

  it("covers every code the SOW catalog gates a duty on", () => {
    const catalogCodes = new Set<string>();
    for (const entry of allSowCatalogEntries()) {
      for (const code of entry.service_codes) catalogCodes.add(code);
    }
    const registryCodes = new Set(awardableServiceCodeChoices());
    for (const code of catalogCodes) {
      assert.ok(registryCodes.has(code), `catalog references ${code} but the registry does not`);
    }
  });

  it("flags exactly the codes not cross-referenced elsewhere, hides nothing", () => {
    for (const entry of SERVICE_CODE_REGISTRY) {
      assert.equal(typeof entry.crossReferenced, "boolean");
    }
    assert.equal(serviceCodeEntry("LPS")?.crossReferenced, false);
    assert.equal(serviceCodeEntry("HHS")?.crossReferenced, true);
  });

  it("labels every code with its full name, not just the bare code", () => {
    assert.equal(serviceCodeLabel("HHS"), "HHS — Host Home Supports");
    assert.equal(serviceCodeLabel(null), "—");
    assert.equal(serviceCodeLabel("not-a-real-code"), "NOT-A-REAL-CODE");
  });

  it("preserves an unrecognized legacy code instead of discarding it", () => {
    const result = reconcileServiceCodes(["HHS", "ZZZ9", "hhs", ""]);
    assert.equal(result.known.length, 1);
    assert.equal(result.known[0]?.code, "HHS");
    assert.deepEqual(result.unrecognized, ["ZZZ9"]);
  });

  it("normalizes case and de-duplicates without dropping anything real", () => {
    assert.deepEqual(normalizeServiceCodes([" hhs ", "HHS", "Sln", null as unknown as string]), [
      "HHS",
      "SLN",
    ]);
  });

  it("distinguishes billing unit and EVV mandate per the authoritative source files", () => {
    const rhs = serviceCodeEntry("RHS")!;
    assert.equal(rhs.billingUnit, "daily");
    assert.equal(rhs.evvMandated, false);
    const slh = serviceCodeEntry("SLH")!;
    assert.equal(slh.evvMandated, true);
    assert.equal(slh.billingUnit, "hourly");
  });
});
