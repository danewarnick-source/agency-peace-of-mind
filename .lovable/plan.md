## Why nothing landed on the client

End-to-end trace of the PCSP → client pipeline found three independent bugs. The extractor itself works; the pipeline downstream silently drops or zeroes the values.

### Bug 1 — PCSP goals silently dropped
The AI sometimes returns a goal in `value_text`, sometimes in `value_array` (the schema allows both). In the Smart Import round-trip, goals that land in `value_array` are serialized to JSON, but `applyExtractedFieldsToClient` reads goals via `fieldText()` which **only checks `value_text`**. Result: every goal stored as an array gets filtered out. (`src/lib/client-import-schema.ts:39–41` and `:195–199`.)

### Bug 2 — Billing rate & units become 0
`applyExtractedFieldsToClient` accepts `rate` / `max_units` **only when `typeof === "number"`** (`client-import-schema.ts:216–222`). The model frequently returns them as strings (`"18.50"`, `"3120"`). They fall through to `?? 0`, the row is inserted with `rate_per_unit = 0` and `annual_unit_authorization = 0`, and the UI shows "no rate/units set." This is why authorized codes appear empty even when the code list itself did populate.

### Bug 3 — MAR/eMAR never auto-disables
There is **no code anywhere** that reads medication presence from the PCSP and toggles `feature_config.emar`. The prompt does not extract a medications signal, and no commit step touches the feature toggle. So MAR/eMAR stays "Enabled" by default forever.

### Bug 4 (root cause shared by 1 & 2) — Smart Import round-trip lossiness
The per-client uploader works better because it passes the raw `ExtractedField[]` straight to `applyExtractedFieldsToClient`. Smart Import stringifies every field into `extracted_fields.value`, then re-parses in `commitClient` — that's where `value_array` gets lost for scalar consumers like `fieldText`. Fixing bugs 1 & 2 also hardens this path.

---

## Fix plan (no schema changes)

### 1. `src/lib/client-import-schema.ts`
- Add a `fieldArray(f)` helper and update `fieldText` consumers for goals to fall back to `value_array[0]` (or join). Concretely: in the `pcsp_goal` mapping block (~`:195–199`), accept text from `value_text`, `value_array`, or even `value_json.text`.
- Make billing-row coercion forgiving:
  ```ts
  const toNum = (v: unknown) =>
    typeof v === "number" ? v
    : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[$,\s]/g, "")) || null
    : null;
  rate: toNum(row.rate),
  max_units: toNum(row.max_units),
  weekly_cap_units: toNum(row.weekly_cap_units),
  ```
  Same coercion for `unit_type`/dates passes through unchanged.
- When `rate` or `max_units` is still null, skip the insert into `client_billing_codes` rather than writing zeros (so the readiness card can correctly flag "rate/units missing" for human follow-up instead of silently faking $0).

### 2. `src/lib/document-extraction.ts`
- Extend `CORE_CLIENT_FIELD_KEYS` and the SYSTEM_PROMPT to extract:
  - `client_medication` — one field per medication listed in the PCSP (name, dose, route, schedule) emitted in `value_json`.
  - `pcsp_has_medications` — boolean derived from whether the PCSP lists any prescribed/administered medication.
- Tell the model: "If the PCSP explicitly states no medications / 'none' / the medication section is absent or empty, emit `pcsp_has_medications=false`."

### 3. `src/lib/smart-import.functions.ts`
- Round-trip preserve `value_array` for `pcsp_goal` by JSON-encoding it the same way `billing_code_row` is encoded, so `commitClient` can re-hydrate it cleanly. (Pairs with Bug 1's reader-side fix as belt-and-suspenders.)
- Persist the new `client_medication` rows and `pcsp_has_medications` boolean into `extracted_fields`.

### 4. `src/lib/smart-import-commit.functions.ts` + `client-import-schema.ts`
- In `applyExtractedFieldsToClient`, after processing fields:
  - If `pcsp_has_medications === false` AND no `client_medication` rows were extracted → set `feature_config.emar = false` on the `clients` row.
  - If `pcsp_has_medications === true` OR any `client_medication` row exists → keep `feature_config.emar = true` and write extracted medications into `client_medications` (best-effort; only fields the model is confident about — name/dose/route/frequency).
- Never overwrite a user's existing explicit toggle: only flip `emar` when the current value matches the platform default (i.e., the user hasn't manually changed it). Skip if the client already has `client_medications` rows on file.

### 5. Clarifying-question pass (already part of the system)
- Anything the model returns with low confidence or that fails the new coercion (e.g., a rate the model couldn't read) is left empty and surfaces in the existing Readiness Card with its inline editor — no separate UI work needed.

---

## Definition of done
- Re-uploading the same PCSP on a fresh client populates:
  - `clients.pcsp_goals` (array, one per row in the PCSP goals table),
  - `client_billing_codes` rows with non-zero `rate_per_unit` and `annual_unit_authorization`,
  - `clients.authorized_dspd_codes` matching the PCSP's code list.
- If the PCSP has no medications, the MAR/eMAR toggle is automatically `false` on the client profile.
- Per-client uploader and Smart Import produce identical results on the same document (no path divergence).
- Anything genuinely missing from the document still shows up in the Readiness Card with its inline editor, per the standing onboarding rule.

## Files touched
- `src/lib/client-import-schema.ts` — bug 1, bug 2, MAR auto-toggle, medication writes.
- `src/lib/document-extraction.ts` — extend prompt + CORE_CLIENT_FIELD_KEYS for medications signal.
- `src/lib/smart-import.functions.ts` — JSON-encode `pcsp_goal` arrays + persist medication fields.
- `src/lib/smart-import-commit.functions.ts` — decode + forward the new keys.

No DB migrations, no new tables, no new columns — uses `clients.feature_config`, `client_medications`, `client_billing_codes`, and the existing `extracted_fields` staging table.