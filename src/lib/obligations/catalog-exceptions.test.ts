import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATALOG_EXCEPTIONS_BY_KEY,
  sowCatalogEntryByKey,
} from "../sow-obligation-catalog.ts";
import { BLOCKS_SOLO_WHEN_LAPSED_KEYS } from "./solo-lapse.ts";
import {
  catalogIsAssignmentGated,
  catalogIsNonwaivable,
  catalogIsSeiOnly,
  resolveCatalogExceptions,
} from "./catalog-exceptions.ts";

describe("catalog exceptions on live-path records", () => {
  it("stamps explicit flags onto the catalog rows the engine already uses", () => {
    const acre = sowCatalogEntryByKey("acre_sei");
    assert.ok(acre?.exceptions);
    assert.equal(acre.exceptions.sei_only, true);
    assert.equal(acre.exceptions.assignment_gated, true);
    assert.equal(acre.exceptions.nonwaivable, true);

    const orientation = sowCatalogEntryByKey("orientation_30_day");
    assert.deepEqual(orientation?.exceptions, CATALOG_EXCEPTIONS_BY_KEY.orientation_30_day);
    assert.equal(orientation?.exceptions?.nonwaivable, false);
    assert.equal(orientation?.exceptions?.assignment_gated, true);

    const coc = sowCatalogEntryByKey("dhhs_code_of_conduct_signed");
    assert.equal(coc?.exceptions?.assignment_gated, true);
    assert.equal(coc?.exceptions?.sei_only, false);
    assert.equal(catalogIsAssignmentGated("dhhs_code_of_conduct_signed"), true);
  });

  it("keeps solo-lapse keys waivable and everything else nonwaivable", () => {
    for (const key of BLOCKS_SOLO_WHEN_LAPSED_KEYS) {
      assert.equal(catalogIsNonwaivable(key), false, key);
      assert.equal(resolveCatalogExceptions(key).nonwaivable, false, key);
    }
    assert.equal(catalogIsNonwaivable("ce_12h_annual"), true);
    assert.equal(catalogIsNonwaivable("medicaid_enrollment"), true);
    assert.equal(catalogIsNonwaivable("acre_sei"), true);
  });

  it("marks ACRE / SEI staff duties SEI-only without inventing a fact_key", () => {
    assert.equal(catalogIsSeiOnly("acre_sei"), true);
    assert.equal(catalogIsSeiOnly("sei_ssi_benefits"), true);
    assert.equal(catalogIsSeiOnly("orientation_30_day"), false);
    assert.equal(catalogIsSeiOnly("dhhs_code_of_conduct_signed"), false);
  });
});
