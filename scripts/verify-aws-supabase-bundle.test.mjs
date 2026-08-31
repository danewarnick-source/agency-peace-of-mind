import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  LEGACY_JWT_ANON_PREFIX,
  RETIRED_SUPABASE_PROJECT_REF,
  hostnameFromSupabaseUrl,
  scanPublicBundle,
} from "./verify-aws-supabase-bundle.mjs";

const HIVE_PLATFORM_URL = "https://dhrrukdcigiiqksibdfb.supabase.co";

function writePublicJs(contents) {
  const dir = mkdtempSync(join(tmpdir(), "hive-aws-supabase-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "assets", "index-abc123.js"), contents);
  return dir;
}

describe("verify-aws-supabase-bundle", () => {
  it("parses the Hive-Platform hostname from VITE_SUPABASE_URL", () => {
    assert.equal(hostnameFromSupabaseUrl(HIVE_PLATFORM_URL), "dhrrukdcigiiqksibdfb.supabase.co");
    assert.equal(hostnameFromSupabaseUrl(""), null);
    assert.equal(hostnameFromSupabaseUrl("not-a-url"), null);
  });

  it("passes when the hashed client JS contains the expected hostname", () => {
    const publicDir = writePublicJs(`const url=${JSON.stringify(HIVE_PLATFORM_URL)};`);
    try {
      const result = scanPublicBundle({ publicDir, viteSupabaseUrl: HIVE_PLATFORM_URL });
      assert.equal(result.ok, true);
      assert.deepEqual(result.errors, []);
      assert.equal(result.jsFileCount, 1);
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("fails when the retired Lovable project ref is baked into JS", () => {
    const publicDir = writePublicJs(
      `const url="https://${RETIRED_SUPABASE_PROJECT_REF}.supabase.co";`,
    );
    try {
      const result = scanPublicBundle({ publicDir, viteSupabaseUrl: HIVE_PLATFORM_URL });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes(RETIRED_SUPABASE_PROJECT_REF)));
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("fails when VITE_SUPABASE_URL itself still points at the retired project", () => {
    const publicDir = writePublicJs(`const url="https://${RETIRED_SUPABASE_PROJECT_REF}.supabase.co";`);
    try {
      const result = scanPublicBundle({
        publicDir,
        viteSupabaseUrl: `https://${RETIRED_SUPABASE_PROJECT_REF}.supabase.co`,
      });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("VITE_SUPABASE_URL still points")));
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("fails when a legacy JWT anon key prefix is present", () => {
    const publicDir = writePublicJs(
      `const url=${JSON.stringify(HIVE_PLATFORM_URL)}; const key="${LEGACY_JWT_ANON_PREFIX}.payload.sig";`,
    );
    try {
      const result = scanPublicBundle({ publicDir, viteSupabaseUrl: HIVE_PLATFORM_URL });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("legacy JWT anon key")));
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("fails when the bundle is missing the hostname from VITE_SUPABASE_URL", () => {
    const publicDir = writePublicJs(`const url="https://example.invalid";`);
    try {
      const result = scanPublicBundle({ publicDir, viteSupabaseUrl: HIVE_PLATFORM_URL });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("does not contain the hostname")));
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });

  it("fails when VITE_SUPABASE_URL is missing", () => {
    const publicDir = writePublicJs(`const url=${JSON.stringify(HIVE_PLATFORM_URL)};`);
    try {
      const result = scanPublicBundle({ publicDir, viteSupabaseUrl: undefined });
      assert.equal(result.ok, false);
      assert.ok(result.errors.some((e) => e.includes("VITE_SUPABASE_URL is missing")));
    } finally {
      rmSync(publicDir, { recursive: true, force: true });
    }
  });
});
