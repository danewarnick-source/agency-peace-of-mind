## The bug (confirmed)

`src/lib/authoritative-sources.functions.ts` builds the dedup key at two spots (lines 938 and ~1664 — the initial-draft path and the re-draft path) as:

```
`${kind}:ai:${titleClean}:${item.citation ?? ""}`
```

That key becomes the row's `requirement_key` AND the in-memory dedupe `Set` seeded from existing rows' `requirement_key`. Because SOW chunks overlap, the same clause is extracted by two AI calls that phrase the citation slightly differently ("Section 1.31(1)" vs "Section 1.31"), so both keys are unique and both rows land.

DB check confirmed exactly what you saw:
- **SOW 2026 (doc `a108ea3d…`): 16 duplicate title-groups, 32 rows.**
- **All other documents in the org: 0 duplicate groups.** This is currently a SOW-2026-only problem, but the code path is shared, so the fix protects every future SOW/contract re-draft.

Sample confirmations from the live table (identical title, citation-format only difference):
- "Submit completed FBAs to Support Coordinator within 14 calendar days…" — `Section 3.3(5)-(6)` vs `Section 3.3(5)`
- "BC3: No direct support or transportation of Person" — `Section 5.5(2-3)` vs `Section 5.5(2)(3)`
- "Submit discharge summary to Support Coordinator upon discharge" — `Section 1.22` vs `Section 1.22(a)`

## Fix 1 — dedup key stops depending on citation

Change the key formula in both places (initial draft ~line 938 and re-draft ~line 1664) to:

```
`${kind}:ai:${titleClean}`.toLowerCase().slice(0, 120)
```

- `source_document_id` scoping is already applied by the `existingKeys` seed query (line 846-850 filters by `source_document_id`), so title+document is the effective dedup grain — matches your rule: "title (and source document) should be the reliable signal."
- `titleClean` is already `item.title.trim().slice(0, 200)` — same normalization we already trust for display.
- No fuzzy matching, no citation comparison. If two AI calls produce character-for-character identical titles for the same source document, the second one is silently skipped (existing behavior, just now actually working).
- `source_citation` on the stored row is unchanged — we keep whichever citation the winning row had; the human reviewer still sees it in the queue.
- No schema change. `requirement_key` is just a text column; existing rows keep their old-format keys and will not collide with new-format keys (which is fine — the seed `Set` reads whatever's there, and the new path only inserts new-format keys).

Non-goals (explicitly not touching):
- Chunking / overlap logic in `extractRequirementsFromText`.
- The AI prompt / citation extraction.
- Review UI, filters, "needs attention" counting.
- The already-shipped source-deletion retirement path.
- Manual `upsertRequirement` (line ~501) — that path is human-driven and out of scope.

## Fix 2 — one-time cleanup of the 16 existing duplicate pairs

Delivered as a data migration (not a hard delete — same "retire" pattern as the source-deletion fix: `review_status = 'removed'`, `updated_at = now()`).

For each `(source_document_id, lower(btrim(title)))` group with COUNT > 1, on `origin = 'document'` and `review_status <> 'removed'`:

1. **Keeper selection, in order:**
   a. If any row in the group has `verified = true` OR `review_status = 'confirmed'` → keep the earliest such row.
   b. Otherwise → keep the row with the earliest `created_at` (ties broken by `id`).
2. **Retire the rest:** set `review_status = 'removed'`, `updated_at = now()`, and stamp `metadata = metadata || jsonb_build_object('retired_reason','duplicate_of', 'retired_of_id', <keeper_id>, 'retired_at', now())` so the audit trail explains why.
3. Migration will be scoped by an explicit list-based filter (title-group + doc) via a CTE — no whole-table sweep. Preview count in the migration description will state exactly: "32 rows across 16 duplicate groups in SOW 2026 will be affected; 16 kept, 16 retired."

Confirmed pairs: all 16 are in SOW 2026 (doc `a108ea3d-2290-448e-925e-5c2ea04c2a2c`); none of the pairs I sampled had a confirmed side, so in practice rule (b) will apply to nearly all of them — but rule (a) stays in the query so it's safe if any get confirmed between now and running the migration.

## Fix 3 — org-wide duplicate scan result

Ran the scan across every `nectar_requirements` row with `origin='document'` and a non-removed `review_status`, grouping by `(source_document_id, lower(btrim(title)))`:

- SOW 2026: 16 pairs / 32 rows.
- **Every other authoritative source in the org: 0 pairs.**

So the cleanup is bounded to those 16 pairs; there is no hidden backlog elsewhere.

## Deliverables when you approve

1. Two-line edit to `src/lib/authoritative-sources.functions.ts` (drop `:${item.citation ?? ""}` from the key in both draft paths).
2. One migration retiring the 16 duplicate rows per the keeper rules above, with a plain-English description of exactly what it touches.
3. No other file changes.
