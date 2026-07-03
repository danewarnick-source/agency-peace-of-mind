## What's happening

When you click Draft on the full Scope of Work (~260,000 chars), the server splits the document into ~5 windows and asks NECTAR to extract requirements from each one. But the current extractor has three silent failure modes that all end in "0 inserted, no message":

1. **Per-chunk cap of 200 items** — a dense SOW window can return more than 200 requirements. The Zod schema rejects the whole chunk, and the code does `continue` — that chunk contributes zero, silently.
2. **Model output truncation** — with 55k-char input windows, the model's JSON output can hit its own output-token ceiling and come back truncated. `JSON.parse` throws, `continue` runs, silently zero.
3. **Sequential chunks + one-row-at-a-time inserts** — 5 chunks × one large model call each, then hundreds of individual inserts, can exceed the server-function wall-clock and time out with a generic error instead of a diagnostic.

The UI only reports the final `inserted` and optional `message`, so all three modes look identical: "nothing happened."

## Fix (scope: `src/lib/authoritative-sources.functions.ts` only)

### 1. Smaller, safer chunks

Change `chunkDocumentText` defaults from 55k / 2k overlap to **~30,000 chars with ~1,500 overlap** (still paragraph-aware, still hard-capped at 40 chunks). Smaller input → smaller expected output → far less risk of truncated JSON, and each call finishes faster.

### 2. Don't silently drop a chunk

In `extractRequirementsFromText`:

- Raise `ReqExtraction`'s `.max(200)` to **`.max(500)`** so a dense chunk isn't wholesale rejected.
- On JSON parse failure OR Zod parse failure OR non-OK response, **retry that chunk once** by splitting it in half and processing the halves. If the retry still fails, record the chunk index + reason in a `chunkFailures: string[]` array instead of silently continuing.
- Keep the existing `429` / `402` early throws so credit/rate-limit errors still bubble up immediately.

### 3. Run chunks with limited parallelism

Process chunks with a concurrency of **3 at a time** (simple `Promise.all` over sliced batches). Cuts wall time roughly 3x for a 260k document without hammering the AI gateway.

### 4. Batch-insert requirements

Replace the per-row `.insert(...).select().single()` loop with a **single `.insert(rows).select("id")`** call per group of 100 rows, deduped up-front against `existingKeys`. Preserves the same `assisted` → `markDraftedByNectar` follow-up (run those after the bulk insert, over the returned ids). This turns hundreds of round-trips into a handful.

### 5. Surface what happened

`generateRequirementsFromSource` returns a richer object the existing toast code already handles gracefully:

- On full success: `{ inserted, reason: "ok" }` (unchanged — existing green toast).
- On partial: `{ inserted, reason: "partial", message: "Drafted N requirements. M of K sections of the document couldn't be read on this pass — click Draft again to retry those sections." }`.
- On zero-with-failures: `{ inserted: 0, reason: "extractor_incomplete", message: "NECTAR couldn't finish reading this document (K sections failed). Click Draft again to retry — this often clears on a second pass. If it keeps failing, the parsed text may be malformed." }` and file the existing `platform_event` with the failure summary.
- Existing `ai_error`, `no_text`, `no_requirements`, and `non_obligation_kind` paths stay exactly as they are.

Idempotency is already handled by `existingKeys` + `requirement_key`, so re-clicking Draft only fills in what's missing — no duplicates.

## Out of scope

- No changes to the UI, the toast wording template, or the progress bar.
- No changes to requirement shape, categories, `applies_to`, citation formatting, or the sow_clause fallback.
- No changes to `raw_text` storage, upload, or parsing.
- No model swap (staying on `google/gemini-2.5-flash`).

## Success check

Draft requirements from the full Scope of Work → the toast reports a few hundred requirements drafted, the Requirements list shows entries citing sections from both the beginning and the end of the document, and any chunk that failed is named in a follow-up warning instead of vanishing.
