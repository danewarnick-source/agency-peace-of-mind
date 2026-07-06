## What's actually happening

`src/lib/authoritative-sources.server.ts` line 81 — the `ReqItem` Zod schema (used by every extractor chunk call) has no `service_code` field. So AI-drafted rows always land with `service_code = null`, and `service_codes_all = null`. Confirmed against live DB: **786 active drafted rows, only 2 have a service_code** (both from the manual `upsertRequirement` path, not AI).

Sample titles show extremely consistent code-prefixing:
- `BC1 Staff must meet...`, `BC2:`, `BC3: Complete BSP...`
- `SLN:`, `SLH:`, `RP5`, `PM2 Staff must...`, `PBA`, `SJR:`
- Multi-code: `SLN/CMP/CMS: Submit written monthly summary...`
- Legitimate no-code (org-wide): `Prohibit false, deceptive, or coercive marketing practices`, `Conduct monthly administrative and quarterly 10% random sample financial reviews`

Distribution against the 33 known codes in `EVV_SERVICE_CODES`:
- **581 / 786 titles (74%)** contain at least one known code as a word-boundary token
- **205 / 786 (26%)** contain no code — genuinely org-wide

## Fix 2 first — approach comparison

You asked which path to take. Recommendation: **regex classifier, not an AI schema change.** Here's why.

| | AI schema change (add `service_code` to `ReqItem`) | Regex classifier (deterministic, post-extraction) |
|---|---|---|
| Cost per re-draft | 0 extra AI calls but larger response tokens on every chunk × 20 chunks | 0 AI calls, ~1ms per row in JS |
| Reliability | AI may hallucinate codes not in the list, phrase them inconsistently ("BC-1", "bc1", "BC 1"), miss obvious prefixes when focused on other fields | Deterministic against `EVV_SERVICE_CODES` — impossible to produce a code that isn't in the canonical list |
| False positives | Possible (AI infers meaning) | Prevented by using ONLY the code token (`\bBC1\b`), never the label; and by scanning title first, description as fallback — never generic prose |
| Multi-code titles like `SLN/CMP/CMS:` | Requires the AI to output an array reliably every time | Regex finds all three trivially |
| Existing pipeline surface touched | ReqItem schema, JSON prompt rules, response validator, chunk merge, both draft paths | Two additive lines in each of the two `aiRows.push()` sites; zero AI-side change |
| If the code list changes (state adds a code) | Requires re-prompt + re-eval | Add one line to `EVV_SERVICE_CODES`, done |
| Backfill for the existing 786 rows | Would require re-running extraction on every document (costly, non-deterministic, would churn other fields) | Same classifier runs against the stored `title`/`description` in a data migration — no AI, deterministic |

Reliability + backfill parity are the decisive factors. The AI already extracted the title text where the code lives verbatim; there's no information the classifier lacks. Going deterministic here matches the rest of the compliance product's posture ("never hallucinate; never invent").

## The classifier — precise rules

New helper `classifyServiceCodes(title, description)` in a new `src/lib/nectar-code-classifier.ts`:

1. Build `KNOWN_CODES = EVV_SERVICE_CODES.map(c => c.code)` — the ONLY strings we'll ever emit.
2. For each code, test `new RegExp('\\b' + code + '\\b')` against `title` (case-sensitive — every DSPD code is uppercase, so this alone rejects lowercase noise like "com" inside "commit").
3. If title has zero matches, run the same check against `description` (many rows have a bare title like "Ensure at least one PN2 staff holds current RN license" — code is in the title, but sometimes only in the description).
4. Return `{ primary: matches[0] ?? null, all: matches }`.
5. Order-preserving dedup so `SLN/CMP/CMS` → `["SLN","CMP","CMS"]` with primary = `SLN`.
6. No fuzzy matching, no substring search, no label matching — only exact uppercase code tokens at word boundaries.

Edge cases handled explicitly:
- Titles containing "DSP" inside `"DSP-eligible"` or `"DSPD"` → word-boundary regex rejects both (`\bDSP\b` doesn't match inside `DSPD`).
- A title with no code stays `service_code = null`, `service_codes_all = null` — org-wide obligations preserved as you asked.
- Duplicate mentions ("SLH billing... SLH staff...") collapse to a single `SLH`.

Two call sites in `authoritative-sources.functions.ts` (initial-draft path around L950 and re-draft path around L1685) — the `aiRows.push({ row: { … } })` object literal gets two extra fields:

```ts
const { primary, all } = classifyServiceCodes(titleClean, item.description);
// …
service_code: primary,
service_codes_all: all.length > 0 ? all : null,
```

No change to `ReqItem`, `EXTRACT_SYSTEM_PROMPT`, chunking, or applies_to logic. Nothing else moves.

## One-time backfill for the 786 existing rows

Two viable shapes. Recommendation: **server function invoked once**, not a raw SQL migration — the classifier lives in TS and Postgres regex would need the code list duplicated + `array_agg` gymnastics, plus we'd want it to skip already-non-null rows.

New server function `backfillDocumentRequirementServiceCodes` (org-scoped, requires `has_role('admin')` or hive-executive):
1. Select `id, title, description` from `nectar_requirements` where `origin = 'document'` AND `service_code IS NULL` AND `review_status <> 'removed'` for the caller's org (786 rows for TNS).
2. Run the same `classifyServiceCodes` helper on each.
3. Batch-update in chunks of 100 with the resulting `service_code` + `service_codes_all`.
4. Return `{ scanned, matched, unmatched, samples }` so we can spot-check before you trust it downstream.

Preview run first (invoke from the Nectar knowledge / exec surface, or I invoke it once via the server-function tools after build), then confirm counts (~581 matched / ~205 unmatched, matching the DB scan above), then done. No migration, no schema change.

## Deliverables when you approve

1. New file `src/lib/nectar-code-classifier.ts` — the pure helper + a small test-friendly `classifyServiceCodes` export.
2. Edits to `src/lib/authoritative-sources.functions.ts` — two call sites populate `service_code` / `service_codes_all` from the classifier.
3. New server function `backfillDocumentRequirementServiceCodes` in `src/lib/authoritative-sources.functions.ts` — one-time, org-scoped, admin-gated.
4. Invoke the backfill once for TNS, report counts + a random-sample spot check.

Not touched: `ReqItem` schema, `EXTRACT_SYSTEM_PROMPT`, chunking, applies_to, category, citation, review queue UI.
