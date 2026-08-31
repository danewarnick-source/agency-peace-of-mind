#!/usr/bin/env node
/**
 * Fail AWS client builds that still point at the retired Lovable Supabase
 * project or bake a legacy JWT anon key. Never prints secret values.
 *
 * Usage: VITE_SUPABASE_URL=https://….supabase.co node scripts/verify-aws-supabase-bundle.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const RETIRED_SUPABASE_PROJECT_REF = "mmknqtdrefbzwfdtykza";
export const LEGACY_JWT_ANON_PREFIX = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function hostnameFromSupabaseUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.hostname || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
export function collectPublicJsFiles(dir, out = []) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectPublicJsFiles(full, out);
      continue;
    }
    if (name.endsWith(".js") || name.endsWith(".mjs")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {{ publicDir: string, viteSupabaseUrl: string | undefined }} opts
 * @returns {{ ok: boolean, errors: string[], jsFileCount: number, hostname: string | null }}
 */
export function scanPublicBundle(opts) {
  const errors = [];
  const viteSupabaseUrl = opts.viteSupabaseUrl;
  const hostname = hostnameFromSupabaseUrl(viteSupabaseUrl ?? "");

  if (!viteSupabaseUrl || viteSupabaseUrl.trim() === "") {
    errors.push("VITE_SUPABASE_URL is missing — copy Vercel production into GitHub Actions secrets");
  } else if (!hostname) {
    errors.push("VITE_SUPABASE_URL is not a valid http(s) URL");
  } else if (hostname.includes(RETIRED_SUPABASE_PROJECT_REF)) {
    errors.push(
      `VITE_SUPABASE_URL still points at retired Lovable project ${RETIRED_SUPABASE_PROJECT_REF}`,
    );
  }

  if (!existsSync(opts.publicDir) || !statSync(opts.publicDir).isDirectory()) {
    errors.push(`missing ${opts.publicDir} — run npm run build:lambda first`);
    return { ok: false, errors, jsFileCount: 0, hostname };
  }

  const jsFiles = collectPublicJsFiles(opts.publicDir);
  if (jsFiles.length === 0) {
    errors.push(`${opts.publicDir} has no .js files to scan`);
    return { ok: false, errors, jsFileCount: 0, hostname };
  }

  const bundle = jsFiles.map((file) => readFileSync(file, "utf8")).join("\n");

  if (bundle.includes(RETIRED_SUPABASE_PROJECT_REF)) {
    errors.push(
      `client JS under .output/public still contains retired project ${RETIRED_SUPABASE_PROJECT_REF}`,
    );
  }

  if (bundle.includes(LEGACY_JWT_ANON_PREFIX)) {
    errors.push(
      "client JS under .output/public contains a legacy JWT anon key (eyJ… prefix) — use sb_publishable_ from Hive-Platform",
    );
  }

  if (hostname && !hostname.includes(RETIRED_SUPABASE_PROJECT_REF) && !bundle.includes(hostname)) {
    errors.push(
      `client JS under .output/public does not contain the hostname from VITE_SUPABASE_URL (expected Hive-Platform once secrets are fixed)`,
    );
  }

  return { ok: errors.length === 0, errors, jsFileCount: jsFiles.length, hostname };
}

export function main(env = process.env, publicDir = join(process.cwd(), ".output/public")) {
  const result = scanPublicBundle({
    publicDir,
    viteSupabaseUrl: env.VITE_SUPABASE_URL,
  });

  if (!result.ok) {
    for (const message of result.errors) {
      console.error(`[verify-aws-supabase-bundle] ${message}`);
    }
    return 1;
  }

  console.log(
    `[verify-aws-supabase-bundle] ok jsFiles=${result.jsFileCount} hostnamePresent=${result.hostname}`,
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main());
}
