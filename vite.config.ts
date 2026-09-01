// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { NITRO_AWS_LAMBDA_PRESET } from "./src/lib/nitro-lambda-preset";

/**
 * `.functions.ts` client stubs still parse top-level imports. Those files
 * import `client.server.ts` / `login.server.ts`, which would otherwise pull
 * `pg`, Cognito, and `node:crypto` into the browser (and into the Cloudflare
 * worker). Stub Node-only AWS modules everywhere except the AWS SSR build.
 */
function hiveStubAwsServerModules(): Plugin {
  const AWS_STUB_ID = "\0hive-aws-server-stub";
  const LOGIN_STUB_ID = "\0hive-login-server-stub";

  const AWS_STUB = `
const fail = () => { throw new Error("AWS server module is not available in this bundle"); };
const asyncFail = async () => { throw new Error("AWS server module is not available in this bundle"); };
export function getAwsDataClient() {
  return { from: fail, rpc: fail };
}
export function getS3StorageAdapter() {
  return { from: () => ({ upload: asyncFail, download: asyncFail, remove: asyncFail, createSignedUrl: asyncFail, getPublicUrl: () => ({ data: { publicUrl: "" } }) }) };
}
export function createAwsAuthAdmin(live) { return live; }
export function wrapAdminAuth(liveAuth) { return liveAuth; }
export async function resolveRequestUser() { return null; }
export async function resolveSupabaseBearer() { return null; }
export async function resolveAnyRequestUser() { return null; }
export async function dispatchPlan() { return { data: null, error: { message: "AWS DB not in this bundle" }, count: null, status: 500, statusText: "Error" }; }
export async function executePlan() { return dispatchPlan(); }
export async function executePlanViaSupabase() { return dispatchPlan(); }
export async function pgQuery() { return { rows: [], rowCount: 0 }; }
export function getPgPool() { throw new Error("pg is not available in this bundle"); }
export async function closePgPool() {}
export async function serverUpload() { return { data: null, error: { message: "S3 not in this bundle" } }; }
export async function serverDownload() { return { data: null, error: { message: "S3 not in this bundle" } }; }
export async function serverRemove() { return { data: null, error: { message: "S3 not in this bundle" } }; }
export async function serverSignedUrl() { return { data: null, error: { message: "S3 not in this bundle" } }; }
export async function serverGetObjectResponse() { return new Response("S3 not in this bundle", { status: 500 }); }
export function readAwsSessionCookie() { return null; }
export function writeAwsSessionCookie() {}
export function clearAwsSessionCookie() {}
export async function cognitoInitiatePasswordAuth() { return fail(); }
export async function cognitoRefresh() { return fail(); }
export async function cognitoGetUser() { return fail(); }
export async function cognitoGlobalSignOut() {}
export async function cognitoForgotPassword() {}
export async function cognitoAdminSetPassword() {}
export async function cognitoAdminCreateUser() {}
export async function cognitoAdminDeleteUser() {}
export async function cognitoAdminUpdateSupabaseId() {}
export async function verifyCognitoJwt() { return fail(); }
export async function resolveAppUserId() { return fail(); }
export function isUuid() { return false; }
`;

  const LOGIN_STUB = `
export async function performPasswordSignIn() { throw new Error("login.server is server-only"); }
export async function performAwsSignOut() {}
export async function performAwsRefresh() { throw new Error("login.server is server-only"); }
export async function performAwsForgotPassword() {}
export async function performAwsUpdatePassword() {}
`;

  function normalize(id: string) {
    return id.replace(/\\/g, "/").split("?")[0];
  }

  function isSsrContext(
    pluginThis: { environment?: { name?: string } },
    options?: { ssr?: boolean },
  ) {
    if (options?.ssr) return true;
    const name = pluginThis.environment?.name;
    return name === "ssr" || name === "server" || name === "nitro";
  }

  function isAwsServerModule(source: string, importer?: string) {
    const n = normalize(source);
    if (n.includes("hive-aws-server-stub") || n.includes("hive-login-server-stub")) return false;
    if (/\/lib\/aws\/[^/]+\.server(\.ts)?$/.test(n)) return true;
    if (/^@\/lib\/aws\/[^/]+\.server(\.ts)?$/.test(n)) return true;
    if (importer) {
      const imp = normalize(importer);
      if (imp.includes("/lib/aws/") && /^\.{0,2}\/?[^/]*\.server(\.ts)?$/.test(n)) return true;
    }
    return false;
  }

  function isLoginServerModule(source: string) {
    const n = normalize(source);
    return (
      /(?:^|\/)lib\/login\.server(\.ts)?$/.test(n) ||
      n === "@/lib/login.server" ||
      n === "@/lib/login.server.ts"
    );
  }

  return {
    name: "hive-stub-aws-server-modules",
    enforce: "pre",
    resolveId(source, importer, options) {
      const ssr = isSsrContext(this, options);
      if (isLoginServerModule(source) && !ssr) return LOGIN_STUB_ID;
      if (isAwsServerModule(source, importer)) {
        // AWS ECS / Lambda SSR needs the real pg / Cognito / S3 modules.
        if (ssr && (isAwsBuild || isLambdaBuild)) return null;
        return AWS_STUB_ID;
      }
      return null;
    },
    load(id) {
      if (id === AWS_STUB_ID) return AWS_STUB;
      if (id === LOGIN_STUB_ID) return LOGIN_STUB;
      return null;
    },
  };
}

/** Swap the live Supabase client for the in-memory e2e stub. Production builds never set this. */
function e2eSupabaseMockPlugin(): Plugin {
  const mock = fileURLToPath(new URL("./e2e/mocks/supabase-client.ts", import.meta.url));
  return {
    name: "e2e-supabase-mock",
    enforce: "pre",
    resolveId(id) {
      const normalized = id.replace(/\\/g, "/");
      if (normalized.includes("e2e/mocks/supabase-client")) return null;
      const isSupabaseClient =
        normalized === "@/integrations/supabase/client" ||
        normalized.endsWith("/integrations/supabase/client") ||
        normalized.endsWith("/integrations/supabase/client.ts") ||
        normalized.endsWith("/integrations/supabase/client.tsx");
      if (isSupabaseClient) return mock;
      return null;
    },
  };
}

// Parallel AWS targets (see docs/AWS_LAMBDA.md and docs/AWS_DEPLOY.md).
// Lovable / Vercel never set BUILD_TARGET, so `npm run build` stays on the
// default cloudflare-module / Vercel path.
//
//   unset            — Vercel / Lovable (do not change)
//   BUILD_TARGET=aws — existing node-server image (`npm run build:aws` → dist-aws/)
//   BUILD_TARGET=lambda — Nitro aws-lambda (`npm run build:lambda` → .output/server
//                         index.handler + .output/public). Dane's CloudFront host.
const isAwsBuild = process.env.BUILD_TARGET === "aws";
const isLambdaBuild = process.env.BUILD_TARGET === "lambda";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isAwsBuild
    ? {
        nitro: {
          preset: "node-server",
          output: {
            dir: "dist-aws",
            serverDir: "dist-aws/server",
            publicDir: "dist-aws/client",
          },
        },
      }
    : isLambdaBuild
      ? {
          nitro: {
            preset: NITRO_AWS_LAMBDA_PRESET,
          },
        }
      : {}),
  vite: {
    plugins: [
      hiveStubAwsServerModules(),
      ...(process.env.VITE_E2E_HARNESS === "1" ? [e2eSupabaseMockPlugin()] : []),
      mcpPlugin(),
    ],
    // Vercel production after #233 died SIGKILL during Nitro "rendering
    // chunks" on an 8 GB Hobby builder. Gzip size reporting and wide
    // Rollup parallelism spike RSS in that exact phase.
    build: {
      reportCompressedSize: false,
      sourcemap: false,
      rollupOptions: {
        maxParallelFileOps: 2,
      },
    },
  },
});
