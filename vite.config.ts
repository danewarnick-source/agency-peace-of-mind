// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// AWS parallel-deploy target (see docs/AWS_DEPLOY.md). Lovable/Cloudflare never sets this
// env var, so its build is completely unaffected — only `npm run build:aws` switches the
// nitro preset from the default cloudflare-module to aws-lambda.
const isAwsBuild = process.env.BUILD_TARGET === "aws";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  ...(isAwsBuild
    ? {
        nitro: {
          preset: "aws-lambda",
          output: {
            dir: "dist-aws",
            serverDir: "dist-aws/server",
            publicDir: "dist-aws/client",
          },
        },
      }
    : {}),
  vite: {
    plugins: [mcpPlugin()],
  },
});
