## Problem

Uploading a client PCSP returns **"upstream request timeout"** at the worker gateway. Root cause is in `src/lib/pdf-import.functions.ts` `extractClientFromPdf`:

- Model is `google/gemini-2.5-pro` — the slowest/heaviest model on the gateway. For a multi-page PCSP with the long extraction schema, the call routinely runs past the worker request limit.
- We pass up to **120,000 characters** of raw PDF text in a single shot, which pushes generation time even higher.
- Response is plain `json_object` (no schema-guided decoding), so the model spends extra time formatting.

Combined, the request exceeds the upstream timeout before the model finishes; the browser sees a 504-style "upstream request timeout" and nothing populates.

## Fix

Single, surgical change to `src/lib/pdf-import.functions.ts`. No schema, RLS, UI flow, or commit logic changes.

1. **Switch model to `google/gemini-3-flash-preview`** (the project's stack-recommended default chat model). It returns the same JSON shape an order of magnitude faster. Pro mode is overkill for field-level extraction from a structured form.
2. **Trim PDF text from 120k → 60k chars** before sending. A typical Utah PCSP is well under 60k of extracted text; trimming kills the worst-case latency without losing real content.
3. **Add explicit timeout + clearer error** on the gateway `fetch` (AbortController, ~55s) so we fail fast with a readable message instead of bubbling the raw "upstream request timeout".
4. Leave commit path, dedupe, billing-codes/meds writes, and the importer UI untouched.

## Out of scope

- No changes to `commitClientFromPdf`, `ai-pdf-importer.tsx`, schemas, or any RLS/grants.
- No chunking/streaming refactor — flash-preview at 60k chars comfortably fits inside the worker budget.

## Acceptance

- Uploading the same PCSP that previously timed out returns the parsed result and reaches the "Review & confirm" panel within the worker timeout.
- Field mapping behavior is unchanged (identity, contact, guardian, emergency, billing codes, meds, goals, alerts, behavior, additional_sections).
- If the gateway is still slow or down, the user sees a clear "AI request timed out" toast rather than "upstream request timeout".
