## Problem

Completing the client setup fails with:
> `clients insert: Could not find the 'clinical_alert' column of clients in the schema cache`

Root cause: `smart-import-commit.functions.ts` maps the extracted PCSP field `clinical_alert` → column `clients.clinical_alert`, but that column doesn't exist on the `clients` table. Every other mapped column (`special_directions`, `bsp_status`, `dnr_status`, `neurologist_name`, etc.) does exist — only `clinical_alert` is missing. When a PCSP has any clinical-alert text, the insert throws and the whole commit is aborted.

Answer to your question: **no, a missing clinical alert should not block anything** — it's an optional field. Two fixes together:

## Fix

### 1. Add the missing column (migration)

Add `clinical_alert text NULL` to `public.clients`. This is a real domain field pulled from the PCSP Clinical Alerts section, so it belongs on the table. Nullable, no default — clients without alerts stay blank.

### 2. Defensive commit (`src/lib/smart-import-commit.functions.ts`)

Wrap the client insert/update so that if PostgREST ever returns a "Could not find the 'X' column" error again (from any future extractor field), the commit strips that column and retries — and logs a warning row to `import_audit` — instead of aborting the whole client creation. This prevents one stray field from ever blocking a setup again.

No changes to the wizard, review UI, or the columns list. No data migration for existing rows.

## Verification

- Re-run "Complete client setup" on this job — insert succeeds; `clients.clinical_alert` populated from the PCSP.
- Manually simulate an unknown column value in an import → commit still succeeds; `import_audit` shows a `skipped_unknown_column` note.

## Out of scope

- No changes to `swallowing_alerts` (separate array field) or the health-step UI copy.
- No renaming or refactoring of other client columns.