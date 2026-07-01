## What to build

On the Smart Import upload page (client mode), replace the flat row of file chips with a **grouped, running list** that appears the moment a file is added and grows as more are added. Each group is headed by a client name and lists every document uploaded for that person with type + a couple of details. Nothing runs until the admin clicks "Process with NECTAR" — this is purely a pre-flight preview.

## Group shape

```text
Blake Adam                                          2 documents
  ─ PCSP · PDF · dated 6/1/26 · 1.4 MB · "BA PCSP - 6.1.26.pdf"     [remove]
  ─ Behavior Plan · DOCX · 220 KB · "BA - BSP draft.docx"           [remove]

Unassigned (tap a chip to tag a client)              1 document
  ─ Roster · CSV · 12 rows · "intake_may.csv"                       [remove]
```

Rosters stay in their own "Roster / table" group (they fan out into many people server-side, so grouping by name is meaningless up front).

## Detection (client-side only, no server calls)

Parse each `File.name` locally the moment it's added:

1. **Document type** — regex match against a keyword table:
   - PCSP, Person-Centered / ISP, IEP, BSP / Behavior, MAR / Medication, Consent, Assessment, 1056 / Authorization, Progress Note, Incident, Emergency, Diet, Seizure, DNR, Guardianship. Falls back to "Document" when nothing matches.
2. **Client identifier** — strip the doc-type token, extension, and any trailing date; take what remains as the label. Handle two common shapes:
   - `"BA PCSP - 6.1.26.pdf"` → initials `BA`
   - `"Blake Adam - PCSP.pdf"` / `"Blake_Adam_PCSP.pdf"` → full name `Blake Adam`
   Two-letter tokens are treated as initials and displayed as `BA` until the admin edits it.
3. **Date** — first `M/D/YY(YY)` or `YYYY-MM-DD` in the name.
4. **File details** — mime/extension + human-readable size (already in `File.size`).

Grouping key = normalized name/initials (case-insensitive, punctuation stripped). Two files that both parse to `BA` land under the same header even before the admin renames it.

## Admin editing before processing

- Each group header is click-to-edit inline: rename "BA" → "Blake Adam" and every file in that group moves with the label. This only affects the preview; server extraction is unchanged.
- Each file row keeps its existing remove (×) affordance.
- A file with no detected identifier lands in "Unassigned"; the admin can drag/select it into an existing group via a small "Move to…" menu, or leave it — NECTAR still processes it, it just wasn't pre-labeled.

Roster/CSV/XLSX files skip name detection entirely and appear in a single "Roster / table" group with row count (parsed via the existing `parseRoster` helper, which already runs before submit — we hoist that parse to happen on add so we can show the row count immediately).

## Files touched

- `src/routes/dashboard.smart-import.index.tsx` — replace the current `{files.length > 0 && ...}` chip strip (≈ lines 327-340) with a new `<UploadedDocsPreview>` block; extend `FileChip` with client-parsed metadata (`detectedClient`, `detectedDocType`, `detectedDate`, `rowCount?`); update `onAddFiles` to run the local parser and (for rosters) `parseRoster` at add-time. No changes to `process.mutationFn` — the server pipeline still receives the same `files` array.

## Non-goals

- No new server function, no schema changes, no changes to review/commit flow.
- Detection is a heuristic label for the admin's benefit, not authoritative — server extraction remains the source of truth for who each document belongs to.
