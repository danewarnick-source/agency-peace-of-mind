# Read entire document when NECTAR extracts requirements

## Problem
`extractRequirementsFromText()` in `src/lib/authoritative-sources.functions.ts` (line 750) sends only the first 60,000 characters of a document to the AI:

```ts
{ role: "user", content: `DOCUMENT TEXT:\n\n${text.slice(0, 60000)}` }
```

A full State Scope of Work is much longer than that, so any requirement past the ~60k mark is never seen by NECTAR. Everything else (raw_text storage, review flow, requirement shape, DB writes, de-dupe by `requirement_key`) already works — only this one call cuts the input short.

## Fix
Change `extractRequirementsFromText` to walk the full document in sequential windows and merge the results, keeping the same return shape so the caller (`generateRequirementsFromSource`) is untouched.

Details:
- Chunk `text` into ~55,000-character windows with a ~2,000-character overlap at chunk boundaries. Overlap prevents a clause that straddles the cut from being missed on both sides.
- Break on paragraph boundaries when possible (last `\n\n` before the window end) so we don't split mid-sentence; fall back to a hard cut if no boundary is found.
- For each chunk, run the existing `gatewayFetch` call with the existing `REQ_SYSTEM_PROMPT` and `ReqExtraction` schema. Prepend a small "PART k of N" line to the user message so the model knows it's seeing part of a larger document.
- Merge results in order. De-dupe within the extractor by a lowercased `title|citation` key so overlap regions don't produce doubled rows going into the DB layer (which then does its own key-based de-dupe).
- Safety cap: process at most 40 chunks (~2.2M chars, well beyond a full SOW). If the document exceeds that, extract from the first 40 chunks and log a `platform_event` from the caller only if we ever hit it — but plain SOWs are far under that ceiling, so nothing changes for real inputs.
- Preserve existing error handling: on 429/402/non-OK, throw the same errors so the caller's `try/catch` reports the same messages. If one chunk fails after some chunks have already succeeded, throw — the caller already surfaces AI errors clearly and the admin can retry cleanly.

Nothing else changes:
- `raw_text` storage — untouched.
- Requirement shape, categories, `applies_to`, citation formatting, `requirement_key` — untouched.
- De-dupe against existing requirements in the DB (`existingKeys`) — untouched.
- Assisted-setup / `markDraftedByNectar` path — untouched.
- Legacy `sow_clause` fallback — untouched.
- `raw_text: text.slice(0, 50000)` in `ingestWebSource` (web-page snapshots) — out of scope; this task is specifically about long file uploads like the SOW, and web-page truncation is a separate rule.

## Verification
Upload the full State Scope of Work as an authoritative source, click "Draft requirements". Confirm the drafted list includes requirements from late sections of the document (e.g., billing/EVV sections past §10, appendices, attachments) — not only early sections. Cross-check by opening one late-section requirement and confirming its citation points to the correct high-numbered section.
