import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  // Guardrail: care data is read through the canonical
  // `getClientCareData` / `useClientCareData` path only.
  // See src/lib/client-care-data.functions.ts for the shared reader and
  // the visibility rules.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // The canonical reader itself.
      "src/lib/client-care-data.functions.ts",
      // Legacy hooks kept as thin wrappers — scheduled for follow-up
      // migration one care-surface at a time.
      "src/hooks/use-client-billing-codes.tsx",
      "src/hooks/use-client-budget.tsx",
      "src/hooks/use-client-caps.tsx",
      "src/hooks/use-shift-med-due-status.tsx",
      // Server-only pipelines that touch these tables for import / billing
      // / audit / financial rollups — different domain, not care reads.
      "src/lib/**/*.functions.ts",
      "src/lib/**/*.server.ts",
      "src/lib/**/*.ts",
      "src/integrations/**",
      "src/routes/api/**",
      // Existing surfaces on the allowlist until they migrate. Adding a
      // new file here is a red flag in review.
      "src/components/workspace/emar-chart.tsx",
      "src/components/workspace/mar-emar-tab.tsx",
      "src/components/workspace/emar-ops-panel.tsx",
      "src/components/workspace/about-tab.tsx",
      "src/components/medications-manager.tsx",
      "src/components/mar-calendar.tsx",
      "src/components/clients/setup-checklist.tsx",
      "src/components/clients/client-specific-training-card.tsx",
      "src/components/clients/client-readiness-card.tsx",
      "src/components/chores/chore-support-activation.tsx",
      "src/components/staff-mobile/client-quick-info-sheet.tsx",
      "src/components/smart-import/**",
      "src/components/audit-portal/**",
      "src/components/ai-pdf-importer.tsx",
      "src/routes/dashboard.emar.tsx",
      "src/routes/dashboard.admin.emar-audit.tsx",
      "src/routes/dashboard.workspace.$clientId.tsx",
      "src/routes/dashboard.shift.$shiftId.tsx",
      "src/routes/dashboard.hhs-hub.$clientId.tsx",
      "src/routes/dashboard.clients.$clientId.tsx",
      "src/routes/dashboard.clients.tsx",
      "src/routes/dashboard.employees.$staffId.tsx",
      "src/routes/dashboard.daily-logs.tsx",
      "src/routes/dashboard.summaries.tsx",
      "src/routes/dashboard.historical-daily-notes-former-staff.tsx",
      "src/routes/dashboard.my-historical-daily-notes.tsx",
      "src/routes/dashboard.host-home-control.tsx",
      "src/routes/dashboard.command-center.tsx",
      "src/hooks/use-caseload.tsx",
      "src/hooks/use-deadlines.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='from'][arguments.0.value=/^(clients|client_medications|client_specific_trainings|client_billing_codes)$/]",
          message:
            "Read client care data via `useClientCareData` (or `getClientCareData` on the server) from src/lib/client-care-data.functions.ts. Do not query clients / client_medications / client_specific_trainings / client_billing_codes directly. Staff-visibility rules live in the shared reader's `visibility` block.",
        },
      ],
    },
  },
  eslintPluginPrettier,
);
