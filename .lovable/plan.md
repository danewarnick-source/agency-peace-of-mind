## Problem
Adding a manual field in Smart Import review fails with:
`new row for relation "extracted_fields" violates check constraint "extracted_fields_provenance_check"`

The live `extracted_fields` table's check constraint only allows `provenance IN ('rule','source','inferred')`, but our code (in `smart-import-review.functions.ts`, in ~8 places incl. the manual-add path) writes `provenance: 'admin_override'`. A later migration added `'admin_override'` but was never applied to live.

## Fix (one migration, no code changes)
Update the live check constraint to match what the app already writes:

```sql
ALTER TABLE public.extracted_fields
  DROP CONSTRAINT extracted_fields_provenance_check;

ALTER TABLE public.extracted_fields
  ADD CONSTRAINT extracted_fields_provenance_check
  CHECK (provenance IN ('rule','source','inferred','admin_override'));
```

That's it — this unblocks "Add a field", plus every other admin edit/override in the review wizard that's silently been hitting this constraint.
