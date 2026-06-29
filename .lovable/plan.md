## Root cause

`parseDocumentWithAI` (src/lib/document-extraction.ts) calls `gatewayFetch` without a `max_tokens` value, so it defaults to **4096** in `ai-bedrock.server.ts`. A real PCSP yields a large JSON envelope (person, address, guardians, goals, medications, billing rows, court orders…), and Bedrock truncates the response mid-string. The truncated text then fails `JSON.parse`, which throws the generic "AI returned malformed JSON. The document may be unreadable." banner you're seeing.

This also explains why earlier runs sometimes returned zero fields silently — same root, different symptom.

## Fix (all in `src/lib/document-extraction.ts`, scoped change)

1. **Raise the output budget on the extraction call.** Pass `max_tokens: 16000` (or 12000) to `gatewayFetch` inside `parseDocumentWithAI`. Bedrock Claude/Nova models support this; the existing default of 4096 is the bottleneck.

2. **Better diagnostics on parse failure.** When `JSON.parse` throws, log the response length, the last 200 chars, and `finish_reason` so we can tell truncation apart from a true malformed response. Replace the user-facing message with one that mentions the document was too long for one pass when truncation is the likely cause (i.e. content ends without a closing `}` / `]`).

3. **Best-effort salvage before failing.** Before throwing, try to recover a partial object: if the trimmed `content` starts with `{` and is missing trailing braces/brackets, attempt to close the open structures and re-parse. If that succeeds, run it through the existing `tolerantParseExtraction` (which already drops malformed individual rows). Only throw the user-visible error if salvage also fails.

4. **No changes to retries, UI, or other callers.** The "Retry" button continues to work; success rate goes up because each retry now has headroom.

## Out of scope

- No DB/schema changes.
- No edits to `ai-bedrock.server.ts` (other Bedrock callers shouldn't get a global bump).
- No prompt changes — the JSON envelope contract stays the same.

## Verification

- Re-upload the same PCSP via Smart Import → expect extraction to complete and the review screen to populate with the client's fields.
- If it still fails, the new logs will show whether `finish_reason === "length"` (still truncated, raise further) vs a genuine model error.
