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
      ...(process.env.VITE_E2E_HARNESS === "1" ? [e2eSupabaseMockPlugin()] : []),
      mcpPlugin(),
    ],
  },
});
