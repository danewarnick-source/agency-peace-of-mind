
## Scope

Three files, additive only. No changes to `tolerantParseExtraction`, recovery logic, master-list validation, EVV gating, or the guardian trigger.

- `src/lib/document-extraction.ts` — `SYSTEM_PROMPT` + `CORE_CLIENT_FIELD_KEYS`
- `src/lib/client-import-schema.ts` — `clients` SELECT + scalar mappings + `codeRows` builder
- One additive migration on `public.clients`

PID handling per spec item 1 + QA: PID → `medicaid_id` only. No `dspd_pid` column.

---

## 1) Migration

```sql
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS mailing_address text,
  ADD COLUMN IF NOT EXISTS support_coordinator_company text;
```

No drops, no type changes, no trigger changes.

---

## 2) `src/lib/document-extraction.ts`

### `CORE_CLIENT_FIELD_KEYS`
- **Add:** `mailing_address`, `support_coordinator_company`, `representative_payee`, `goal_domain`, `goal_current_status`, `goal_strengths`, `goal_barriers`, `goal_success_criteria`.
- **Remove:** `level_of_need`.

### `SYSTEM_PROMPT` edits

- **Person group:** add — `medicaid_id` is also labeled "PID" or "Person ID" on a PCSP. Extract that value into `medicaid_id` (digits only). Do not emit a separate PID field.
- **Address group:** add `mailing_address` (value_text) from "Mailing Address". Keep `physical_address` for "Residential Address".
- **Support coordinator group:** add `support_coordinator_company` (value_text) — the SC firm/org name.
- **Guardian section:** explicit instruction — "Rep payee" / "Representative Payee" is a financial arrangement and MUST NOT map to `guardian_name`/`guardian_phone`. Emit a separate `representative_payee` (value_text, group `"finance"`) with the named person/entity.
- **Goals:** keep one `pcsp_goal` per goal. When present, also emit per-goal context fields as value_text: `goal_domain` (e.g. Community Living, Healthy Living), `goal_current_status`, `goal_strengths`, `goal_barriers`, `goal_success_criteria`.
- **Billing (PCSP service authorization table):** add a dedicated clause. The PCSP service authorization table has columns: Service Code | Kind | Provider | Start Date | End Date | Financial Eligibility | Rate | Monthly Max Units | Units | Prorated Units | Total $ | Daily Hours. Emit one `billing_code_row` per row with:

  ```json
  {
    "service_code": "HHS",
    "provider_name": "True North Supports Utah, LLC",
    "rate": 276,
    "max_units": 365,
    "monthly_max_units": 31,
    "unit_type": "day",
    "plan_start": "YYYY-MM-DD",
    "plan_end": "YYYY-MM-DD",
    "financial_eligibility": "TM",
    "daily_hours": null
  }
  ```

  - `rate` numeric, no `$`.
  - `max_units` = the Units column (annual), integer.
  - `monthly_max_units` = Monthly Max Units, integer.
  - `unit_type` = translate Kind: `Q` → `"15 min"`, `D` → `"day"`, `M` → `"month"`, `S` → `"session"`.
  - Read EVERY row; do not collapse codes. Provider column is authoritative.
  - Keep existing 1056 behavior intact.
- **Remove** the entire "Level of need" bullet and any mention of `level_of_need`.

### `parseDocumentWithAI`
No changes.

---

## 3) `src/lib/client-import-schema.ts`

### `clients` SELECT (~lines 184–206)
- **Add columns:** `mailing_address, support_coordinator_company`.
- **Remove:** `level_of_need`.

### Scalar mappings
- **Add:** `setScalarText("mailing_address", "mailing_address")`, `setScalarText("support_coordinator_company", "support_coordinator_company")`.
- **Remove:** `setScalarText("level_of_need", "level_of_need")` (~line 371).

### `codeRows` builder (~lines 415–438)
Extend the parsed row shape and carry through new fields. New optional members: `provider_name`, `monthly_max_units`, `financial_eligibility`, `daily_hours`.

```ts
const codeRows: Array<{
  service_code: string;
  rate?: number | null;
  max_units?: number | null;
  monthly_max_units?: number | null;
  unit_type?: string | null;
  weekly_cap_units?: number | null;
  plan_start?: string | null;
  plan_end?: string | null;
  provider_name?: string | null;
  financial_eligibility?: string | null;
  daily_hours?: number | null;
}> = [];

for (const f of ok) {
  if (f.field_key === "billing_code_row" && f.value_json && typeof f.value_json === "object") {
    const row = f.value_json as Record<string, unknown>;
    if (row.service_code) {
      codeRows.push({
        service_code: String(row.service_code).toUpperCase(),
        rate: toNum(row.rate),
        max_units: toNum(row.max_units),
        monthly_max_units: toNum(row.monthly_max_units),
        unit_type: row.unit_type ? String(row.unit_type) : null,
        weekly_cap_units: toNum(row.weekly_cap_units),
        plan_start: row.plan_start ? String(row.plan_start).slice(0, 10) : null,
        plan_end:   row.plan_end   ? String(row.plan_end).slice(0, 10)   : null,
        provider_name: row.provider_name ? String(row.provider_name).trim() : null,
        financial_eligibility: row.financial_eligibility ? String(row.financial_eligibility).trim() : null,
        daily_hours: toNum(row.daily_hours),
      });
    }
  }
}
```

Downstream `stubs` builder (~lines 496–526):
- Pass `monthly_max_units: r.monthly_max_units ?? null` into the upserted row (column already exists on `client_billing_codes` per `useClientBillingCodes` typing). No other change.
- `provider_name`, `financial_eligibility`, `daily_hours` are captured in the in-memory row shape only — **no DB write** in this prompt (prompt 15 owns the schema/persistence for `provider_name`). They are carried through so prompt 15 can flip them on without revisiting extraction.

### Rep payee
No commit changes — `representative_payee` flows through Smart Import as a non-core field. Critical behavior (keeping rep-payee text out of `guardian_name`/`guardian_phone`) is enforced by the prompt change.

---

## Out of scope

- No `provider_name` column on `client_billing_codes` (prompt 15).
- No changes to `tolerantParseExtraction` or recovery logic.
- No changes to master-list validation.
- No `dspd_pid` column.
- No guardian-trigger changes.

## QA

- `npx tsgo --noEmit` clean; `npm run build` ok.
- Re-import a real PCSP:
  - `medicaid_id` populated from PID line, digits only.
  - `physical_address` from Residential Address; `mailing_address` from Mailing Address.
  - `support_coordinator_company` set.
  - No `level_of_need` written.
  - Every `billing_code_row.value_json` carries `provider_name`, `rate`, `max_units`, `unit_type` (e.g. HHS → provider "True North Supports Utah, LLC", rate 276, 365 units, unit_type "day"; SCE → Intermountain…; UTP → Utah Transit Authority).
  - Rep payee never appears in guardian fields.
