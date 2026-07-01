## What broke
Blake Adams' latest PCSP import returned 21 fields but zero goals, even though the PCSP has goals (earlier runs of the same client got 6 and 12). NECTAR silently produced an empty goal list and the UI showed the neutral "no goals found" message — the admin had no signal that extraction failed.

Two underlying issues:
1. **No retry / no failure signal** when the wide extraction pass drops the goals section entirely.
2. **Rich goal outline is discarded** even when the model returns it: `aiExtractFieldsFromText` only JSON-encodes `billing_code_row` and `client_medication` rows, so `pcsp_goal` value_json (with `why`, `responsible_party`, `service_codes`, `supports`, `data_capture`, etc.) falls into the plain-text branch and only the goal sentence survives.

## Fix — three scoped changes, no schema work

### 1. Persist the full goal outline
In `src/lib/smart-import.functions.ts`, add `pcsp_goal` to the structured-row branch alongside `billing_code_row` / `client_medication` so `value_json` is stored verbatim. Now the review wizard's "PCSP goals — full outline" step actually receives the rationale, responsible party, service codes, supports, and data-capture fields NECTAR extracted.

### 2. Zero-goals retry pass
Add `extractGoalsOnly(text)` to `src/lib/document-extraction.ts`: a focused prompt that returns ONLY `pcsp_goal` fields with the same structured shape, at higher token budget. In `aiExtractFieldsFromText`, after the primary pass, if the returned `pcsp_goal` count is 0 AND the source text contains goal-section markers (goal / objective / outcome / action plan / support plan), call `extractGoalsOnly` and merge any returned goals into `fields`.

### 3. Fail loud when extraction still finds nothing
If both passes return zero `pcsp_goal` fields, emit a synthetic field `pcsp_goal_extraction_failed = true` (provenance `inferred`, is_custom). In the PCSP-goals step of the review wizard, when that flag is present, replace the neutral empty-state copy with an amber banner:

> NECTAR could not extract goals from this PCSP. Add them manually before continuing, or re-run extraction. Do NOT publish this client until goals are entered.

The existing "+ Add goal" affordance stays — this just makes the extraction miss visible instead of pretending the PCSP had no goals.

## Scope guardrails
- No DB migration. No new server function. No changes to the commit path — commit already reads `pcsp_goal` from `extracted_fields`.
- No changes to how the Bedrock gateway is called for other document types.
- The retry pass fires only for client-mode imports where the primary pass returned zero goals.
