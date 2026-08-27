import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/hooks/use-auth", replacement: path.join(here, "mocks/use-auth.ts") },
      { find: "@/hooks/use-org", replacement: path.join(here, "mocks/use-org.ts") },
      { find: "@/hooks/use-caseload", replacement: path.join(here, "mocks/use-caseload.ts") },
      {
        find: "@/hooks/use-active-shift",
        replacement: path.join(here, "mocks/use-active-shift.ts"),
      },
      {
        find: "@/hooks/use-client-care-data",
        replacement: path.join(here, "mocks/use-client-care-data.ts"),
      },
      {
        find: "@/hooks/use-shift-behavior-setting",
        replacement: path.join(here, "mocks/use-shift-behavior-setting.ts"),
      },
      {
        find: "@/lib/ai-coach.functions",
        replacement: path.join(here, "mocks/ai-coach.functions.ts"),
      },
      {
        find: "@/lib/client-target-behaviors.functions",
        replacement: path.join(here, "mocks/client-target-behaviors.functions.ts"),
      },
      { find: "@tanstack/react-start", replacement: path.join(here, "mocks/tanstack-start.ts") },
      { find: "@tanstack/react-router", replacement: path.join(here, "mocks/tanstack-router.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: 4177,
    strictPort: true,
  },
});
