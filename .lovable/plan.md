## Problem

Step 6 is labeled "Plan & documents," which makes users expect to see uploaded PCSP/MAR files. It actually only holds text snippets NECTAR couldn't confidently file into a section. The user has chosen "Unmatched notes" as the new title.

## Fix (copy-only, no logic changes)

In `src/routes/dashboard.smart-import.$jobId.review.tsx`:

1. **Rename the step** (sidebar + section header):
   - Line 456 (sidebar step): `label: "Plan & documents"` → `label: "Unmatched notes"`
   - Line 2846 (review summary card `<SectionHeader title="Plan & documents" …/>`) → `title="Unmatched notes"` and adjust its `count` prop to read `${docs.length} note${docs.length === 1 ? "" : "s"} still to file`.

2. **Rewrite the step 6 intro** (lines 606–608) so the purpose is unambiguous:
   > "Notes NECTAR pulled from your uploads but couldn't confidently file into a section (Health, Behavioral, Preferences, etc.). Uploaded files themselves — PCSP, MAR, and any supporting docs — are stored with this import and don't need to be re-attached here. File each note under an existing section, create a new one, or leave it for later."

3. **Rewrite the empty state** in `UnfiledPanel` (line 2487):
   > "NECTAR filed every note from your uploads into a section. Nothing here needs your attention."

4. **Rewrite the review-tab summary empty state** (line 2848):
   > "— every note from your uploads was filed automatically —"

No changes to data fetching, `unfiled_items`, `import_documents`, extraction, or commit. Purely relabeling so the page's purpose is obvious before you open it.

## Files touched

- `src/routes/dashboard.smart-import.$jobId.review.tsx` — four copy changes listed above.
