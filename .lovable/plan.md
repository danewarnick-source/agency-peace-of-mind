# Keep full document text on upload

## Problem
When a document is uploaded and parsed (Scope of Work, PCSP, etc.), the extracted plain text is saved to `nectar_documents.raw_text` but capped at 50,000 characters. Anything past that cap is silently dropped, so long documents like the State SOW lose their tail end.

Source of the cut: `src/lib/nectar-documents.functions.ts`, line 243:
```ts
raw_text: text.slice(0, 50000),
```

That is the only place upload text is truncated. State onboarding / template uploads don't add their own cap.

## Fix
One-line change in `src/lib/nectar-documents.functions.ts`:

- Replace `raw_text: text.slice(0, 50000),` with `raw_text: text,` so the full extracted text is stored regardless of length.

The `raw_text` column is Postgres `text` (unbounded), so no schema change is needed.

## Out of scope (unchanged, per your ask)
- Upload UI, file size limits, parsing pipeline, extraction prompts, autofill logic — all untouched.
- The 120,000-char slice we send to the AI extractor stays as-is; that's a model-input guardrail, not storage. It only affects what the extractor sees, not what we keep. If you later want the AI to also read the full document, that's a separate change.

## Verification
Upload the full State Scope of Work, then check `nectar_documents.raw_text` length for that row — it should match the real extracted length of the PDF instead of stopping at 50,000.
