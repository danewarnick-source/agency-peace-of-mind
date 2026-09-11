import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CUSTOM_FIELD_DELETE_CHUNK,
  chunkIds,
  customFieldDeleteCopy,
} from "./custom-field-delete.ts";

describe("chunkIds", () => {
  it("returns empty for no ids", () => {
    assert.deepEqual(chunkIds([]), []);
  });

  it("dedupes and drops blanks", () => {
    assert.deepEqual(chunkIds(["a", "a", "", "b"]), [["a", "b"]]);
  });

  it("splits at the custom-field delete chunk size", () => {
    const ids = Array.from({ length: CUSTOM_FIELD_DELETE_CHUNK + 2 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(ids);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]?.length, CUSTOM_FIELD_DELETE_CHUNK);
    assert.deepEqual(chunks[1], ["id-80", "id-81"]);
  });
});

describe("customFieldDeleteCopy", () => {
  it("warns that a single delete applies to every client", () => {
    const copy = customFieldDeleteCopy(["Pharmacy"]);
    assert.equal(copy.title, 'Delete "Pharmacy"?');
    assert.match(copy.body, /every client/);
    assert.match(copy.body, /cannot be undone/);
  });

  it("names a bulk delete and caps the listed labels", () => {
    const copy = customFieldDeleteCopy(["A", "B", "C", "D", "E", "F"]);
    assert.equal(copy.title, "Delete 6 custom fields?");
    assert.match(copy.body, /"A"/);
    assert.match(copy.body, /and 1 more/);
    assert.match(copy.body, /every client/);
  });
});

describe("client custom field delete wiring", () => {
  const panel = readFileSync(
    new URL("../components/clients/custom-fields-panel.tsx", import.meta.url),
    "utf8",
  );
  const fns = readFileSync(new URL("./custom-fields.functions.ts", import.meta.url), "utf8");

  it("selects rows, select-all, and delete selected on the existing panel", () => {
    assert.match(panel, /Select all/);
    assert.match(panel, /Delete selected/);
    assert.match(panel, /<Checkbox/);
    assert.match(panel, /deleteCustomFieldDefinitions/);
    assert.match(panel, /createCustomFieldDefinition/);
    assert.match(panel, /setCustomFieldValue/);
    assert.match(panel, /AlertDialog/);
    assert.doesNotMatch(panel, /[\u{1F300}-\u{1FAFF}]/u);
  });

  it("hard-deletes definitions in chunks on the existing table, no new RLS", () => {
    assert.match(fns, /from\("custom_field_definitions"\)/);
    assert.match(fns, /\.in\("id", chunk\)/);
    assert.match(fns, /chunkIds/);
    assert.match(fns, /deleteCustomFieldDefinitions/);
    assert.doesNotMatch(fns, /CREATE POLICY|ALTER POLICY/);
    assert.doesNotMatch(fns, /deleted_at/);
  });
});
