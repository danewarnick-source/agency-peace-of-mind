# Fix: two PDFs assigned to the same client create two subjects

## Why it's happening

In `src/routes/dashboard.smart-import.index.tsx` the UI already tracks a `clientKey` per file (from the "test / test" dropdowns), but that key is **never sent to the server**. The upload path only sends `rosterBatches` + `textBlobs` to `runSmartExtraction`.

In `src/lib/smart-import.functions.ts` (`runSmartExtraction`, ~L392–411), the server loop is:

```
for each uploaded PDF/DOCX text blob:
  aiExtractFieldsFromText(...)
  INSERT INTO import_subjects (...)   ← one row per document
  INSERT extracted_fields for that new subject
```

So two PDFs = two `import_subjects` rows, regardless of what the admin picked in the "Move to client" dropdown. The grouping the user sees on the upload screen is purely cosmetic today.

## Fix

Carry the client grouping end-to-end and collapse same-group docs into one subject.

### Client changes — `src/routes/dashboard.smart-import.index.tsx`

1. When calling `recordDoc`, also pass `client_key` and `client_label` from the chip so the server persists the admin's grouping choice on `import_documents`.
2. Nothing else changes in the UI — the existing "Move to client" dropdown already writes `clientKey` onto every chip.

### Server changes — `src/lib/smart-import.functions.ts`

1. `recordImportDocument`:
   - Extend the Zod input with optional `client_key` and `client_label`.
   - Persist them on `import_documents` (see migration below).

2. `runSmartExtraction` — text-blob / uploaded-doc branch (currently L343–428):
   - When downloading `import_documents`, also select `client_key`, `client_label`.
   - Build `realTextBlobs` with `client_key` / `client_label` attached (pasted text stays keyless).
   - **Bucket blobs by `client_key`** (empty key = its own bucket, one subject per doc so today's behavior is preserved for unassigned docs).
   - For each bucket with a non-empty key:
     - Create **one** `import_subjects` row. Prefer `client_label` for `display_name`; fall back to the first extracted `display_name`.
     - Run `aiExtractFieldsFromText` for every blob in the bucket and insert **all** their `extracted_fields` + `unfiled_items` under that single `subject_id`, keeping each row's own `source_document_id` for provenance.
     - If two blobs disagree on the same `target_field`, keep both rows: mark the second as `status: "flag"` with a `"conflict with <file>"` snippet so the reviewer can pick a winner (no silent overwrite).
   - Roster batches keep today's "one subject per row" behavior — they aren't affected.

3. `import_field_provenance` / summary counts don't need changes; they roll up by subject.

### Migration (SQL handoff)

`import_documents` needs two nullable columns:

```sql
ALTER TABLE public.import_documents
  ADD COLUMN IF NOT EXISTS client_key   text,
  ADD COLUMN IF NOT EXISTS client_label text;
CREATE INDEX IF NOT EXISTS import_documents_job_client_key_idx
  ON public.import_documents (import_job_id, client_key);
```

No RLS/grant changes — inherits existing policies.

## Out of scope

- The pending-clients review page (`dashboard.clients.pending.tsx`) and Smart Import review already render one card per `import_subjects` row, so no changes needed there — collapsing at the subject level fixes the visible symptom.
- Roster CSV/XLSX rows keep their current one-subject-per-row semantics.
- No change to `aiExtractFieldsFromText` prompts.

## Verification

1. Upload two PDFs, use the dropdowns to assign both to "test".
2. Run extraction → summary shows **1 person**, not 2.
3. Open the review page → single "test" card with fields sourced from both documents; conflicting values appear as review flags rather than silent overwrites.
4. Leave a doc as "Unassigned" and confirm it still creates its own subject.
