#!/usr/bin/env npx tsx
// Title → key backfill for company_obligations.
// Unmatched titles become source=provider. Every row is updated or logged —
// zero silent skips. Does not apply live SQL; Soft Core runs the migration first.
//
// Usage (after columns exist):
//   npx tsx scripts/backfill-obligation-keys.ts --fixture
//   npx tsx scripts/backfill-obligation-keys.ts --dry-run   (needs SUPABASE_URL + key)

import {
  SOFT_BACKFILL_TITLE_ALIASES,
  sowCatalogEntry,
  sowCatalogEntryByKey,
  type SowCatalogEntry,
} from "../src/lib/sow-obligation-catalog.ts";

export { SOFT_BACKFILL_TITLE_ALIASES };

export type ObligationBackfillRow = {
  id: string;
  title: string;
  source: string;
  key?: string | null;
  disposition?: string | null;
  state_code?: string | null;
};

export type ObligationBackfillUpdate = {
  id: string;
  title: string;
  key: string;
  disposition: string;
  state_code: string;
  source: string;
};

export type ObligationBackfillResult = {
  updated: ObligationBackfillUpdate[];
  unmatched: ObligationBackfillRow[];
  logs: string[];
};

export const BACKFILL_FIXTURE_ROWS: ObligationBackfillRow[] = [
  { id: "fix-1", title: "30-Day New Hire Orientation Training", source: "sow" },
  { id: "fix-2", title: "Person-Centered Thinking and Practices Training", source: "sow" },
  { id: "fix-3", title: "Person-Centered Thinking — [Client Name]", source: "sow" },
  { id: "fix-4", title: "Person-Centered Thinking — Jane Doe", source: "sow" },
  { id: "fix-5", title: "Emergency Management and Business Continuity Plan", source: "sow" },
  { id: "fix-6", title: "Custom Agency Handbook Review", source: "sow" },
  { id: "fix-7", title: "CPR & First Aid Certification", source: "sow" },
  { id: "fix-8", title: "Client-Specific Training", source: "sow" },
  { id: "fix-9", title: "CPR/First Aid Certification", source: "sow" },
  { id: "fix-10", title: "CPR & First Aid Certification — Initial", source: "sow" },
  { id: "fix-11", title: "CPR & First Aid Certification — Renewal", source: "sow" },
];

function resolveCatalog(title: string): SowCatalogEntry | null {
  const aliasedKey = SOFT_BACKFILL_TITLE_ALIASES[title];
  if (aliasedKey) return sowCatalogEntryByKey(aliasedKey);
  return sowCatalogEntry(title) ?? sowCatalogEntryByKey(title);
}

export function backfillObligationKeys(rows: ObligationBackfillRow[]): ObligationBackfillResult {
  const updated: ObligationBackfillUpdate[] = [];
  const unmatched: ObligationBackfillRow[] = [];
  const logs: string[] = [];

  for (const row of rows) {
    const catalog = resolveCatalog(row.title);
    if (catalog) {
      const next: ObligationBackfillUpdate = {
        id: row.id,
        title: row.title,
        key: catalog.key,
        disposition: catalog.disposition,
        state_code: catalog.state_code,
        source: row.source === "provider" ? "provider" : "sow",
      };
      updated.push(next);
      logs.push(`matched id=${row.id} title=${JSON.stringify(row.title)} key=${catalog.key}`);
      continue;
    }

    unmatched.push({ ...row, source: "provider" });
    logs.push(
      `UNMATCHED id=${row.id} title=${JSON.stringify(row.title)} → source=provider`,
    );
  }

  return { updated, unmatched, logs };
}

function parseArgs(argv: string[]) {
  return {
    fixture: argv.includes("--fixture"),
    dryRun: argv.includes("--dry-run") || argv.includes("--fixture"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.fixture) {
    const result = backfillObligationKeys(BACKFILL_FIXTURE_ROWS);
    for (const line of result.logs) console.log(line);
    console.log(
      JSON.stringify(
        {
          updated: result.updated.length,
          unmatched_titles: result.unmatched.map((r) => r.title),
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    "Live backfill needs the additive columns from 20260911080000_obligation_catalog_keys.sql.",
  );
  console.log("Soft Core applies that SQL, then re-run with a request-scoped client.");
  console.log("Use --fixture to exercise title→key matching without a database.");
  if (!args.dryRun) {
    process.exitCode = 2;
  }
}

const isDirect =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("backfill-obligation-keys.ts");

if (isDirect) {
  void main();
}
