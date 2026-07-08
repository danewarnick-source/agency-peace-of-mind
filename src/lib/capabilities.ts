/**
 * Organization RBAC capability catalog (pass 1).
 *
 * Three grains — no finer:
 *   1. `section.*`   — one per top-level nav section
 *   2. `data.*` / `billing.*` — sensitive-data flags that cut across sections
 *   3. `<section>.view` / `<section>.manage` — only where the distinction is real
 *
 * The DB is the source of truth for the *effective* set (see
 * `public.has_capability` and `public.effective_capabilities`). This file is
 * the canonical TS keyset for autocomplete, role editors, and gates.
 */

// -- Section access (top-level nav) --------------------------------------
export const SECTION_CAPABILITIES = [
  "section.clients",
  "section.employees",
  "section.scheduler",
  "section.finances",
  "section.reports",
  "section.documentation",
  "section.settings",
  "section.exec",
] as const;

// -- Sensitive-data flags (cut across sections) --------------------------
export const DATA_CAPABILITIES = [
  "data.financials", // wages, budgets, any financial data
  "data.phi", // client PHI / medical
  "data.pba", // PBA / trust ledgers
  "billing.manage", // billing submission / adjustments
] as const;

// -- View vs. manage (only where meaningfully distinct) ------------------
export const ACTION_CAPABILITIES = [
  "clients.view",
  "clients.manage",
  "employees.view",
  "employees.manage",
  "scheduler.view",
  "scheduler.manage",
  "reports.view",
  "reports.manage",
  "documentation.view",
  "documentation.manage",
  "settings.manage",
] as const;

export const ALL_CAPABILITIES = [
  ...SECTION_CAPABILITIES,
  ...DATA_CAPABILITIES,
  ...ACTION_CAPABILITIES,
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  "section.clients": "Clients section",
  "section.employees": "Employees section",
  "section.scheduler": "Scheduler section",
  "section.finances": "Finances section",
  "section.reports": "Reports section",
  "section.documentation": "Documentation section",
  "section.settings": "Settings section",
  "section.exec": "Executive section",
  "data.financials": "See financial data (wages, budgets, totals)",
  "data.phi": "See client PHI / medical data",
  "data.pba": "See PBA / trust ledger data",
  "billing.manage": "Manage billing submissions",
  "clients.view": "View clients",
  "clients.manage": "Create / edit clients",
  "employees.view": "View employees",
  "employees.manage": "Create / edit employees",
  "scheduler.view": "View schedule",
  "scheduler.manage": "Create / edit shifts",
  "reports.view": "View reports",
  "reports.manage": "Manage report configuration",
  "documentation.view": "View documentation",
  "documentation.manage": "Author / edit documentation",
  "settings.manage": "Manage organization settings",
};

/**
 * Baseline capability sets for the seeded system roles — MUST stay in sync
 * with `public.seed_system_rbac_roles` in the RBAC pass 1 migration. The DB
 * is authoritative; this mirror exists so callers can render "what a role
 * grants" without a round-trip.
 */
export const SYSTEM_ROLE_BASELINES = {
  Admin: [...ALL_CAPABILITIES] as Capability[],
  Manager: [
    "section.clients",
    "section.employees",
    "section.scheduler",
    "section.reports",
    "section.documentation",
    // Note: no data.financials / data.pba by default (opt-in per user)
    "data.phi",
    "clients.view",
    "clients.manage",
    "employees.view",
    "employees.manage",
    "scheduler.view",
    "scheduler.manage",
    "reports.view",
    "documentation.view",
    "documentation.manage",
  ] as Capability[],
  Employee: [
    "section.clients",
    "section.scheduler",
    "section.documentation",
    "clients.view",
    "scheduler.view",
    "documentation.view",
  ] as Capability[],
} satisfies Record<string, Capability[]>;

export type SystemRoleName = keyof typeof SYSTEM_ROLE_BASELINES;
