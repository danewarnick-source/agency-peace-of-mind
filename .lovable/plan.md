# Smart Import rebuild — Prompt 3: extraction, the 1056, multi-doc merge, triple-check gate

## Goal
Make NECTAR actually do what the done-page UI implied in prompt 2: read the 1056, read per-category uploads, merge multiple documents per client without silently overwriting or losing data, and validate everything BEFORE the profile is created. Plus close the silent-failure holes that caused the staff_ratio debugging session.

All four DB columns this depends on (`form_1056_number`, `form_1056_approved_date`, plus prompt-1 medication / DNR columns) are already live — verified.

## Part A — The 1056 as a first-class document

1. **Extractor prompt + key list** (`src/lib/document-extraction.ts`).
   - Add `form_1056_number`, `form_1056_approved_date` to `CORE_CLIENT_FIELD_KEYS`.
   - Add a new section to `SYSTEM_PROMPT` describing the 1056: header has `form_1056_number` (text), `form_1056_approved_date` (ISO), and a per-code authorization table — same `billing_code_row` shape already used by PCSP (`service_code`, `max_units`, `unit_type`, `plan_start`, `plan_end`; rate column is often blank on the 1056 — leave null when absent).
2. **Saver mapping** (`src/lib/client-import-schema.ts`).
   - Add `setScalarText("form_1056_number","form_1056_number")` and `setScalarDate("form_1056_approved_date","form_1056_approved_date")`.
   - Add both keys to the `KNOWN_CORE` set so they don't fall to the custom-field bucket.
3. **Units-authoritative rule**.
   - Extend `applyExtractedFieldsToClient` to accept an optional `sourceDocumentType?: "pcsp" | "1056_budget" | "mar" | "bsp" | "immunization" | "allergy" | "dnr" | "polst" | "palliative" | "hospice" | "other"`.
   - When `sourceDocumentType === "1056_budget"`, the billing-code upsert sets `annual_unit_authorization` from `max_units` unconditionally (wins over any prior value). For PCSP-sourced rows, `annual_unit_authorization` only fills when the existing value is null/0 (PCSP no longer overwrites a 1056 number).
   - The "REPLACE `authorized_dspd_codes`" behavior stays gated to PCSP/1056 (the two authoritative sources). MAR / BSP / etc. never touch billing codes.

## Part B — Per-category extraction routing

One prompt, one extractor, one schema (`parseDocumentWithAI`). Per-category behavior is driven by:

- A new `documentType` hint passed into `parseDocumentWithAI(text, "documentType=mar; ...")`.
- A new server fn `extractAndApplyClientUpload({ clientId, documentType, storagePath, fileName })` in `src/lib/import-checklist.functions.ts` that:
  1. Downloads the file from `client-documents` bucket (private; signed URLs as needed).
  2. Extracts text (PDF / DOCX path already exists in `smart-import.functions.ts` — promote `extractPdfText` / `extractDocxText` helpers to `src/lib/document-text.server.ts` and share).
  3. Calls `parseDocumentWithAI(text, "documentType=<category>")`.
  4. Routes the extracted fields:
     - `mar` → upsert each `client_medication` field into `client_medications` (uses prompt-1 cols: `support_level`, `am_pm`, `scheduled_time`, `support_explanation`).
     - `bsp` → write `bsp_status` + free-text BSP notes to a custom field; document already attached.
     - `immunization` → append each extracted vaccine to `clients.immunizations`.
     - `allergy` → append to `clients.allergies`.
     - `dnr` / `polst` / `palliative` / `hospice` → call `setEndOfLifeStatus`. For DNR, also pull a `dnr_location` candidate.
     - `pcsp` / `1056_budget` → call `applyExtractedFieldsToClient(..., { sourceDocumentType })`.
  5. Always writes the `client_documents` row first (already wired in prompt 2 via `attachClientDocument`), then extraction runs against the file just attached.
- The existing prompt-2 NectarAsk Upload path calls `extractAndApplyClientUpload` AFTER `attachClientDocument` succeeds — this is the prompt-3 flip the user called out: in prompt 2 we only attached; in prompt 3 we attach AND read.
- **Unsure-placement → custom field**: already handled by the saver's `KNOWN_CORE` fall-through (line 597+). New behavior: when an unknown key reaches the custom-field path, set `custom_field_definitions.source = "import_unsure"` (new tag) so the review screen's "Additional info" tab can render an `Ask the admin where it goes` UI (existing field / new custom / discard) backed by a new tiny fn `reassignCustomField({ valueId, action, targetFieldKey? })`. No silent discard.

## Part C — Multi-document merge + conflict surfacing

The saver already does list-union for arrays and "only fill empty / push to suggested" for scalars. The gaps are:
1. **Possible-duplicate flagging on list items**.
   - When merging an array column, run a lightweight fuzzy check (token-set Jaccard ≥ 0.6 OR one is a substring of the other after lowercasing) against the existing entries; if matched, do not auto-collapse — write a row to a new tiny table `import_merge_flags` (`organization_id`, `client_id`, `field`, `existing_value`, `incoming_value`, `kind = 'possible_duplicate'`, `created_at`, `resolved_at`).
   - Surface on the review screen under a new "Merge review" section per subject. Admin actions: Keep both / Merge into existing / Replace.
2. **Scalar conflict surfacing**.
   - The saver already pushes disagreements to `suggested`. Promote each such case to an `import_merge_flags` row (`kind='scalar_conflict'`, `incoming_value`, `existing_value`, `suggested_value`). Pre-suggested value follows the per-domain authoritative source rule below.
3. **Authoritative-source-per-domain** (encoded in the saver, applied when picking the suggested value on conflict):
   - Medications → MAR wins.
   - Service-code units → 1056 wins (already covered in Part A).
   - Goals / guardian / dysphagia → PCSP wins.
   - Everything else → newer document wins (use `import_documents.uploaded_at`).
4. **NEVER silent-merge two different people**. Already done at subject-matching time (`match_status`). Tighten: when `match_status='ambiguous'`, block commit until the admin explicitly picks `update` vs `create_new` (existing review-decision flow — verify the commit path refuses to proceed with `null` decision on ambiguous; if it currently auto-creates, fix to require explicit decision).

DB change for this part:

```sql
CREATE TABLE public.import_merge_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  field text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('possible_duplicate','scalar_conflict')),
  existing_value text,
  incoming_value text,
  suggested_value text,
  resolved_action text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_merge_flags TO authenticated;
GRANT ALL ON public.import_merge_flags TO service_role;
ALTER TABLE public.import_merge_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage merge flags" ON public.import_merge_flags
  FOR ALL TO authenticated
  USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));
```

## Part D — Triple-check validation gate

New module: `src/lib/import-validation.ts` (pure, no I/O) — collects every check and returns a `{ ok: boolean; issues: ValidationIssue[]; overridable: boolean }`. Uses the existing `nectar-quality` validators and adds client-aware ones:

- `validatePersonName(first_name)`, `validatePersonName(last_name)`.
- `validateAddress(physical_address, knownAddresses)`.
- Date-pair logic: `admission_date` ≤ `discharge_date`; `form_1056_approved_date` ≤ today; each `billing_code_row.plan_start` ≤ `plan_end`. Reuses `validateDateLogic`'s pattern, generalised to `validateDateOrder(earlier, later, labelEarlier, labelLater)`.
- `isNonAnswer` sweep over every required SOW field (existing `CLIENT_PROFILE_FIELDS.filter(f => f.sowRequired)`).
- New `findClientContradictions(draft)` (parallel to `findContradictions` for incidents): `is_own_guardian === true && guardian_name?.trim()` → flag; `pcsp_has_medications === false && medRowsExist` → flag; `dysphagia === false && swallowing_alerts?.length` → flag; etc.
- **Rate-table sanity**: each extracted `service_code` must exist in `EVV_SERVICE_CODES`. Flag unknown codes. For known codes, if `rate` is present and falls outside a coarse plausibility band (`0.01 < rate < 1000` for hourly/15-min; `1 < rate < 10000` for daily), flag for confirmation — band is intentionally wide; this catches OCR errors like `$1,850` parsed as `1.85`.
- **Medicaid ID format**: trim → must be 10 digits after `padMemberId` (`src/lib/evv-codes.ts:padMemberId`); flag otherwise.

Wire-in at two points:
1. **Review screen — "Mark ready" gate**. Inside `setSubjectReady` (`src/lib/smart-import-review.functions.ts`), assemble the draft from `extracted_fields` for that subject and run the validator. If issues exist and admin hasn't explicitly overridden, return them; the review UI renders a "NECTAR needs you to confirm these before saving" panel and `Mark ready` is disabled until each issue is resolved or the admin clicks `Override — I've checked` (writes the issue keys into `import_subjects.validation_overrides jsonb`, audited).
2. **Commit — pre-write gate**. In `commitClient` (`src/lib/smart-import-commit.functions.ts`), before the first DB write, re-run the validator against the assembled draft. Any unresolved + unoverridden issue → throw; the existing `audit(... "commit_failed")` path captures it. Idempotent retry path remains intact.

DB change:

```sql
ALTER TABLE public.import_subjects
  ADD COLUMN IF NOT EXISTS validation_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
```

## Part E — Close silent-failure holes

Files: `src/lib/client-import-schema.ts`, `src/lib/smart-import-commit.functions.ts`.

Audit every error path that currently swallows or only pushes to `suggested`/`gaps`:
- `client_ratios` insert (line 517) — on error, audit + push to `gaps`.
- EVV geocode update error (line 492) — already pushes to suggested, ALSO audit as `geocode_error`.
- Custom-field upsert catch (line 644, 562) — bare `catch` becomes `catch (err) { audit(... "custom_field_error" ...) }`.
- Feature-config emar toggle (line 426) — bare catch becomes audited `medications_signal_error`.
- Tracked-field unknown sweep (line 733) — bare catch becomes audited `confirmation_sweep_error`.

Audit calls use the existing `audit()` helper signature already present in `smart-import-commit.functions.ts`. New `action_type` values added but no schema change (the column is free-text).

Where the saver is called from `nectar-documents.functions.ts` (per-client upload, no smart-import job context), pipe errors through a callback parameter `onError?: (action: string, message: string) => Promise<void>` so the caller can choose to write to its own audit table — keeps the saver decoupled from any one audit schema.

## Part F — UI surfaces (minimal — backend-first prompt)

- Review screen → new collapsible "Merge review" subsection rendering unresolved `import_merge_flags` rows with Keep both / Merge / Replace actions, calling new fn `resolveMergeFlag({ flagId, action })`.
- Review screen → "Mark ready" button shows the validator panel inline above it when issues exist.
- Done-page checklist already exists from prompt 2 — no further changes needed there for this prompt.

## Files touched

**New**:
- `src/lib/document-text.server.ts` — shared `extractPdfText` / `extractDocxText` (moved out of `smart-import.functions.ts`).
- `src/lib/import-validation.ts` — pure validator pipeline + `findClientContradictions`.
- `supabase/migrations/<ts>_import_merge_flags_and_validation.sql` — new table + `validation_overrides` column.

**Edited**:
- `src/lib/document-extraction.ts` — add 1056 keys + prompt section.
- `src/lib/client-import-schema.ts` — `sourceDocumentType` plumbing, units-authoritative rule, merge-flag writes, audit-on-error throughout.
- `src/lib/import-checklist.functions.ts` — `extractAndApplyClientUpload`, `reassignCustomField`, `resolveMergeFlag`. Existing `attachClientDocument` stays; the upload path now chains attach → extract.
- `src/lib/smart-import-commit.functions.ts` — pre-commit validation gate, audit-everywhere.
- `src/lib/smart-import-review.functions.ts` — `setSubjectReady` runs the gate; new `overrideValidationIssue` fn.
- `src/routes/dashboard.smart-import.$jobId.review.tsx` — Mark-ready gate panel + merge-flags section.
- `src/components/clients/nectar-ask.tsx` — after a successful upload, call `extractAndApplyClientUpload` and update the answered summary to reflect what NECTAR pulled out (honest now — it really did read it).

**Untouched** (verified):
- `src/lib/nectar-quality.ts` — used as-is; new client-specific validators live in the new file so the incident wizard is undisturbed.
- The done-page checklist / `ImportChecklist` from prompt 2.

## Verification before PR
1. `npm run build` green; `src/routeTree.gen.ts` staged.
2. Upload a 1056 to an existing client — `form_1056_number` and `form_1056_approved_date` persist on `clients`; per-code `annual_unit_authorization` is overwritten by 1056 values even when a PCSP set them first; audit row shows `commit_subject` with `sourceDocumentType=1056_budget`.
3. Upload a MAR via the done-page NectarAsk — new `client_medications` rows appear with `am_pm` / `scheduled_time` / `support_level` populated; the answered summary updates to reflect the medications NECTAR pulled out.
4. Upload two PCSPs with conflicting prescribing doctors — second upload writes an `import_merge_flags` row of `kind='scalar_conflict'`, admin resolves on the review screen, value persists.
5. Upload a PCSP for an existing client whose Medicaid ID matches but name doesn't — `match_status='ambiguous'`, commit blocked until admin picks update vs create.
6. Submit-for-setup on a client missing `physical_address` AND with `is_own_guardian=true` + a guardian_name set — validator panel surfaces both issues; Mark ready is disabled; clicking "Override — I've checked" persists the override and unblocks. Commit-time gate also sees the override and proceeds.
7. Force a `client_ratios` insert error (bad ratio string) — `import_audit` shows `staff_ratio_error` row, not a silent drop.
8. Confirm `KNOWN_CORE` includes every key in the extractor prompt (script-check: `rg "field_key.*=" + diff against KNOWN_CORE`).

## Explicit non-goals
- No new auth, no new orgs/RLS helpers — reuses `is_org_member`.
- No new storage buckets — uses `client-documents` (already exists) and `import-documents` (already exists).
- No PHI columns added.
- No edits to the incident-wizard validators.
- The four prompt-1 columns and prompt-2 components stay as-is.
