import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  readSupabaseAdminEnv,
  readSupabasePublicEnv,
} from "./supabase-public-env.ts";
import { resolveSupabaseClientEnv } from "./aws/env.ts";

describe("readSupabasePublicEnv", () => {
  it("accepts the preview pair VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY", () => {
    const mapped = readSupabasePublicEnv({
      VITE_SUPABASE_URL: "https://preview.supabase.co",
      VITE_SUPABASE_ANON_KEY: "vite-anon-key",
    });
    assert.deepEqual(mapped, {
      url: "https://preview.supabase.co",
      key: "vite-anon-key",
    });
  });

  it("does not require SUPABASE_URL or SUPABASE_ANON_KEY as a second pair", () => {
    const mapped = readSupabasePublicEnv({
      VITE_SUPABASE_URL: "https://preview.supabase.co",
      VITE_SUPABASE_ANON_KEY: "vite-anon-key",
      SUPABASE_URL: undefined,
      SUPABASE_ANON_KEY: undefined,
      SUPABASE_PUBLISHABLE_KEY: undefined,
    });
    assert.equal(mapped?.url, "https://preview.supabase.co");
    assert.equal(mapped?.key, "vite-anon-key");
  });

  it("still accepts the legacy publishable names when they are already set", () => {
    const mapped = readSupabasePublicEnv({
      SUPABASE_URL: "https://legacy.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "legacy-publishable",
    });
    assert.deepEqual(mapped, {
      url: "https://legacy.supabase.co",
      key: "legacy-publishable",
    });
  });

  it("returns null when neither VITE_ nor legacy public names are set", () => {
    assert.equal(readSupabasePublicEnv({}), null);
  });
});

describe("readSupabaseAdminEnv", () => {
  it("maps admin URL from VITE_SUPABASE_URL when SUPABASE_URL is unset", () => {
    const mapped = readSupabaseAdminEnv({
      VITE_SUPABASE_URL: "https://preview.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    });
    assert.deepEqual(mapped, {
      url: "https://preview.supabase.co",
      serviceRoleKey: "service-role",
    });
  });

  it("returns null without inventing a service-role name", () => {
    assert.equal(
      readSupabaseAdminEnv({
        VITE_SUPABASE_URL: "https://preview.supabase.co",
        VITE_SUPABASE_ANON_KEY: "vite-anon-key",
      }),
      null,
    );
  });
});

describe("resolveSupabaseClientEnv with VITE_ preview names", () => {
  it("does not throw Missing SUPABASE_URL when only VITE_ public names exist", () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const savedViteUrl = process.env.VITE_SUPABASE_URL;
    const savedViteAnon = process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.VITE_SUPABASE_URL = "https://preview.supabase.co";
    process.env.VITE_SUPABASE_ANON_KEY = "vite-anon-key";
    try {
      const env = resolveSupabaseClientEnv();
      assert.equal(env.SUPABASE_URL, "https://preview.supabase.co");
      assert.equal(env.SUPABASE_PUBLISHABLE_KEY, "vite-anon-key");
    } finally {
      if (savedUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = savedUrl;
      if (savedKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
      else process.env.SUPABASE_PUBLISHABLE_KEY = savedKey;
      if (savedViteUrl === undefined) delete process.env.VITE_SUPABASE_URL;
      else process.env.VITE_SUPABASE_URL = savedViteUrl;
      if (savedViteAnon === undefined) delete process.env.VITE_SUPABASE_ANON_KEY;
      else process.env.VITE_SUPABASE_ANON_KEY = savedViteAnon;
    }
  });
});

describe("signup Create account env wiring", () => {
  it("admin client and client resolver map from VITE_ names", () => {
    const admin = readFileSync(
      new URL("../integrations/supabase/client.server.ts", import.meta.url),
      "utf8",
    );
    const resolver = readFileSync(new URL("./aws/env.ts", import.meta.url), "utf8");
    const helper = readFileSync(new URL("./supabase-public-env.ts", import.meta.url), "utf8");
    const checks = readFileSync(new URL("./signup-checks.functions.ts", import.meta.url), "utf8");
    assert.match(admin, /readSupabaseAdminEnv/);
    assert.match(resolver, /readSupabasePublicEnv/);
    assert.match(helper, /import\.meta\.env\.VITE_SUPABASE_URL/);
    assert.match(helper, /import\.meta\.env\.VITE_SUPABASE_ANON_KEY/);
    assert.match(checks, /readSupabaseAdminEnv/);
    assert.match(checks, /exists: false/);
  });

  it("does not throw Missing SUPABASE_URL from the public env helper", () => {
    const helper = readFileSync(new URL("./supabase-public-env.ts", import.meta.url), "utf8");
    assert.doesNotMatch(helper, /Missing Supabase environment variable\(s\): SUPABASE_URL/);
  });
});
