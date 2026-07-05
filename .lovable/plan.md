# Fix orphaned requirements after a source document is deleted

## 1. Why deleting a source doesn't clean up its requirements

`nectar_requirements.source_document_id` has an `ON DELETE SET NULL` foreign key to `nectar_documents`. `deleteDocument` in `src/lib/nectar-documents.functions.ts` just deletes the row — there's no cascade, no status update, no cleanup step. As a result:

- The requirement row survives with `source_document_id = NULL` and `review_status = 'needs_attention'` (its default).
- Every "needs attention" query in `authoritative-sources-page.tsx` counts it and shows it under an "Unknown source" bucket.
- The UI has no way to distinguish "the user never handled this" from "the source it came from no longer exists."

## 2. Current scope of the bug

Live counts pulled just now:

| Bucket | Count |
| --- | --- |
| `needs_attention` from a **still-existing** source document | 41 |
| `needs_attention` from a **deleted** source document (`source_document_id IS NULL`, `origin = 'document'`) | **791** |
| `needs_attention` demo-origin | 2 |
| **Total needs_attention (what the tab shows)** | **834** |

So ~791 of the ~771 you saw are these orphans. The real "needs your attention" pile is 41.

## 3. Recommended fix

Treat deleting an Authoritative Source as an intentional retraction of everything it drafted. Concretely, in the same order:

### a. Change the delete flow to cascade cleanup

In `deleteDocument` (`src/lib/nectar-documents.functions.ts`), *before* deleting the `nectar_documents` row, run one update:

```
UPDATE nectar_requirements
   SET review_status = 'removed',
       approval_state = COALESCE(approval_state, 'hive_exec_rejected'),
       updated_at = now()
 WHERE source_document_id = :documentId
   AND review_status <> 'confirmed';
```

Rules encoded here:
- `origin = 'document'` requirements drafted from that source and never confirmed → `removed`. They stop counting in "needs attention" and move into the existing "removed" bucket the UI already filters out.
- Requirements the user already **confirmed** are left alone. They represent real, human-attested obligations; the source PDF being gone shouldn't retroactively unconfirm them (but its `source_document_id` will still SET NULL after the row is deleted — that's already how confirmed-then-source-deleted requirements behave today, so no regression).
- We use `removed` (not hard-delete) because `nectar_requirements` is referenced by 8 other tables (bindings, mappings, certifications, forms, hr_documents, staff_checklist, staff_training_hours, client_intake_completion). Half CASCADE, half SET NULL — hard-deleting would silently break existing bindings. `removed` is the pattern this app already uses for the same "not applicable / out of scope" concept, and it composes with all the existing filters.

This is the same "set aside similar to not applicable" behavior you already have for out-of-scope items — not a hard delete.

### b. One-time backfill for the current 791 orphans

Same update, applied to already-orphaned rows so the counter drops now without waiting for future deletes:

```
UPDATE nectar_requirements
   SET review_status = 'removed', updated_at = now()
 WHERE source_document_id IS NULL
   AND origin = 'document'
   AND review_status = 'needs_attention';
```

Expected effect: needs_attention drops from 834 → 43 (41 real + 2 demo).

### c. Belt-and-suspenders: prevent future orphans

The FK's `ON DELETE SET NULL` was the root enabler. Two options — I recommend **keeping SET NULL** (so `removed`-then-preserved requirements still lose their dangling FK) but relying on step (a) to mark them `removed` first. Changing the FK to `ON DELETE CASCADE` would hard-delete confirmed history too, which is worse. No FK change needed.

### d. UI: no changes required

- `effectiveStatusOf` in `authoritative-sources-page.tsx` already returns `removed` when `review_status = 'removed'`, and the "needs attention" filter and counter already exclude it.
- The "Unknown source" grouping for orphans still exists but only holds `removed` rows after the backfill, which the default view hides.

## Files that will change (build phase)

- `src/lib/nectar-documents.functions.ts` — add the pre-delete requirements update inside `deleteDocument`.
- One migration to run the backfill in step (b).

Nothing else in the Requirements UI or unrelated features is touched.

Approve and I'll implement + run the backfill migration.