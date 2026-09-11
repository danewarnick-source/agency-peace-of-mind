import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BACKFILL_FIXTURE_ROWS,
  backfillObligationKeys,
} from "../../scripts/backfill-obligation-keys.ts";
import {
  BY_KEY,
  PACK_VERSION,
  allSowCatalogEntries,
  catalogCreatesInstances,
  obligationCreatesInstances,
  sowCatalogEntry,
  sowCatalogEntryByKey,
} from "./sow-obligation-catalog.ts";

describe("SOW catalog pack identity", () => {
  it("gives every entry a unique key, UT state, disposition, and pack version", () => {
    const entries = allSowCatalogEntries();
    const keys = entries.map((e) => e.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const entry of entries) {
      assert.ok(entry.key.length > 0, `missing key for ${entry.title}`);
      assert.equal(entry.state_code, "UT");
      assert.equal(entry.added_in, PACK_VERSION);
      assert.match(entry.disposition, /^(obligation|standing|intake|by_design|retired)$/);
      assert.equal(BY_KEY.get(entry.key), entry);
      assert.equal(sowCatalogEntryByKey(entry.key)?.title, entry.title);
    }
  });

  it("keeps hire-level PCT live and retires the per-client path", () => {
    const hire = sowCatalogEntry("Person-Centered Thinking and Practices Training");
    assert.equal(hire?.key, "pct_hire_practices");
    assert.equal(hire?.disposition, "obligation");
    assert.equal(hire?.retired_in, undefined);

    const retired = sowCatalogEntry("Person-Centered Thinking — [Client Name]");
    assert.equal(retired?.key, "pct_client");
    assert.equal(retired?.disposition, "retired");
    assert.equal(retired?.retired_in, PACK_VERSION);
    assert.equal(sowCatalogEntry("Person-Centered Thinking — Jane Doe")?.key, "pct_client");
    assert.equal(sowCatalogEntry("Person-Centered Thinking and Practices")?.key, "pct_hire_practices");
  });

  it("does not create instances for non-obligation dispositions", () => {
    const standing = sowCatalogEntry("Emergency Management and Business Continuity Plan");
    const intake = sowCatalogEntry("Grievance Policy Acknowledgment — Signed");
    const byDesign = sowCatalogEntry("Electronic Visit Verification");
    const retired = sowCatalogEntryByKey("pct_client");
    assert.equal(catalogCreatesInstances(standing), false);
    assert.equal(catalogCreatesInstances(intake), false);
    assert.equal(catalogCreatesInstances(byDesign), false);
    assert.equal(catalogCreatesInstances(retired), false);
    assert.equal(
      obligationCreatesInstances({
        title: "Emergency Management and Business Continuity Plan",
        disposition: "standing",
      }),
      false,
    );
    assert.equal(
      obligationCreatesInstances({ title: "30-Day New Hire Orientation Training" }),
      true,
    );
    assert.equal(
      obligationCreatesInstances({ title: "Custom Agency Handbook Review", source: "provider" } as {
        title: string;
      }),
      true,
    );
  });

  it("seeds one pack_changelog added row per catalog key", () => {
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260911080000_obligation_catalog_keys.sql", import.meta.url),
      "utf8",
    );
    const seeded = [...sql.matchAll(/'UT', 'UT-2026\.07', '([a-z0-9_]+)', 'added'/g)].map(
      (m) => m[1] ?? "",
    );
    const catalogKeys = allSowCatalogEntries().map((e) => e.key).sort();
    assert.deepEqual([...new Set(seeded)].sort(), catalogKeys);
  });

  it("resolves every audit instrument key", () => {
    const auditSrc = readFileSync(new URL("./dspd-audit-tool.ts", import.meta.url), "utf8");
    assert.match(auditSrc, /export const AUDIT_INSTRUMENTS = \{\s*UT: DSPD_AUDIT_ITEMS,/);
    const keys = [...auditSrc.matchAll(/obligation_keys:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
      [...(m[1] ?? "").matchAll(/"([a-z0-9_]+)"/g)].map((k) => k[1] ?? ""),
    );
    assert.ok(keys.length >= 40);
    for (const key of keys) {
      assert.ok(sowCatalogEntryByKey(key), `audit key missing: ${key}`);
    }
  });

  it("keeps pack coverage aligned with new review-tool / intake / retired titles", () => {
    const coverage = readFileSync(new URL("./utah-dspd-pack/coverage.ts", import.meta.url), "utf8");
    for (const entry of allSowCatalogEntries()) {
      if (!["intake", "by_design", "retired"].includes(entry.disposition)) continue;
      assert.ok(
        coverage.includes(`"${entry.title}"`),
        `coverage missing catalog title: ${entry.title}`,
      );
    }
  });
});

describe("obligation key backfill", () => {
  it("maps fixture titles, retires per-client PCT, and logs unmatched with source=provider", () => {
    const result = backfillObligationKeys(BACKFILL_FIXTURE_ROWS);
    assert.equal(result.updated.length + result.unmatched.length, BACKFILL_FIXTURE_ROWS.length);
    assert.equal(
      result.updated.find((r) => r.id === "fix-1")?.key,
      "orientation_30_day",
    );
    assert.equal(result.updated.find((r) => r.id === "fix-2")?.key, "pct_hire_practices");
    assert.equal(result.updated.find((r) => r.id === "fix-3")?.disposition, "retired");
    assert.equal(result.updated.find((r) => r.id === "fix-4")?.key, "pct_client");
    assert.equal(result.updated.find((r) => r.id === "fix-5")?.disposition, "standing");
    assert.deepEqual(
      result.unmatched.map((r) => r.title),
      ["Custom Agency Handbook Review"],
    );
    assert.equal(result.unmatched[0]?.source, "provider");
    assert.ok(result.logs.some((line) => line.includes("UNMATCHED") && line.includes("Custom Agency Handbook Review")));
    assert.ok(result.logs.length === BACKFILL_FIXTURE_ROWS.length);
  });
});
