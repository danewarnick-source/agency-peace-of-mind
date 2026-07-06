
# Authoritative Sources — full interaction test (findings only)

Tested against the live preview signed in as your admin session. No data was deliberately altered; one duplicate "Add code" click did fire an API call (see finding S3) — flagging so you know. I did NOT confirm, remove, batch-confirm, or delete any requirements or documents.

Backfill effect confirmed: the Requirements tab now says **Review queue (40)** / **2 documents need review**, down from ~834.

---

## What works (green)

**Tabs & top bar**
- All four tabs (Sources / Requirements / Authorized codes / Attestation log) switch correctly.
- "Back to setup" link, "5 of 6 steps complete" badge render.
- "How this works" expand/collapse works and reveals routing rules text.
- "Review recommended…" advisory banner renders on every tab.

**Sources tab**
- Documents list renders (7 docs). "Draft requirements" button present on every parsed doc that hasn't been fully drafted yet (6 buttons).
- Upload panel: File / Add from URL toggle switches modes cleanly; kind dropdown, Title, Fiscal year, Effective start/end fields render; "Request HIVE-assisted setup" checkbox toggles.
- "Upload & parse" / "Capture & parse page" buttons correctly disabled until a file/URL is present.

**Requirements tab**
- Header counters correct: `2 documents need review`, `Review queue (40)`.
- Filter chips (`All`, `Needs attention (24)`, `Fully confirmed (0)`) all clickable and change the visible list.
- `Select all shown (24)` checkbox works — banner updates to "24 selected — each will be logged individually to the attestation trail" and the "Confirm 24 selected" button un-disables. `Clear` clears the selection.
- `Add manual requirement` opens the dialog (Title / Description / Category dropdown / Citation).
- `Review queue (40)` opens the walk-through popover with A/S/R/←→ shortcuts, "High-confidence only", Skip / Remove / Just the requirement / Approve buttons, correct "Item 1 of 40".
- `Details` opens the requirement detail dialog: Source, original wording, NECTAR APPLICABILITY (collapsible), NECTAR EXPLAIN THIS with "Explain in plain language" button.
- `Remove…` opens the confirmation dialog with the correct copy ("This requirement was drafted from an authoritative source you uploaded"), disabled `Confirm removal` until the acknowledgement checkbox is ticked, `Cancel` closes.
- Per-row `Confirm requirement` button renders (not clicked to avoid changing data).
- NECTAR APPLICABILITY collapsibles on every row expand/collapse.

**Authorized codes tab**
- List of 8 codes renders with correct active/standby chips and source (manual vs contract) badges.
- Empty submit is validated → red toast "Enter a code first." (correct).
- Info banner "Coverage follows the contract — not current activity" renders.

**Attestation log tab**
- All 37 entries render with type badge, actor, timestamp, and attestation statement. Immutable-log copy present.

---

## Broken / unexpected behaviour

### S1 — Sources tab, first card is visually broken *(highest priority)*
Screenshot: 01_sources_tab / 18_how_this_works.
The first source card ("Master Staff_Legal Checklist (2.2026) - STAP.pdf") has severe layout overlap:
- The status pill row `80 drafted · 17 total · 0 fully confirmed · 16 needs attention · 1 not applicable · 7/3/2026` renders ON TOP OF the file/title text.
- The `Re-draft` button also overlaps the title block.
- The card has no visible document-title header — only "Other / Parsed" chips, then the overlapping pill strip, then the file metadata bleeding through.
Every other source card renders cleanly. Likely an absolute-positioning or missing wrapper on the "already fully drafted" variant of the card.

### S2 — "SOW 2026" source appears stuck in "Parsing…"
Screenshot: 18_how_this_works.
The `SOW 2026` doc (uploaded 7/6/2026 by Dane) shows a `Parsing…` status chip and its `Draft requirements` button is disabled, with no visible parse-progress or error surfaced in the UI. Nothing to click to re-trigger or diagnose. Worth checking whether nectar_documents.parse_status is stuck vs. actually still running.

### C1 — Duplicate authorized code silently "saves"
Screenshot: 17_addcode_dupe.
Typing an existing code (`DSG`) and clicking `Add code` returns success toast "Authorized code saved — NECTAR will keep its requirements live." No new row appears (correctly), but there's no "already added" message and — depending on the upsert logic — the existing row's `source` may have been rewritten from `manual` to whatever's in the Source dropdown (in my test it was `Contract`). Suggest either (a) validate-and-block duplicates with an explicit toast, or (b) at minimum leave the existing source unchanged and toast "Already authorized."

### C2 — Trash / delete icons on code rows have no aria-label
Screenshot: 06_codes_tab.
Delete buttons on each code row are icon-only with no accessible name. Screen readers can't announce them; automated tests can't target them by role/name. Not tested for actual delete behaviour (would remove data).

### R1 — Fully confirmed (0) filter is not visually distinguishable when active
Minor — clicking `Fully confirmed (0)` filters the list to empty (correct) but the tab active-state styling is subtle enough that from the screenshot it's hard to tell whether the chip is selected. Not broken, just easy to miss.

### A11y / console warnings (all tabs)
- Console: `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}` — fires for the "Add manual requirement" dialog and the "Review queue" dialog. Add `<DialogDescription>` or `aria-describedby`.
- Console error: `A component is changing an uncontrolled input to be controlled` — traces to the Fiscal year / Effective start / Effective end inputs in the upload panel; the initial value is `undefined` then flips to a string.

### N1 — First source card also has no `Draft requirements` OR `Re-draft` in a usable state
Same card as S1: the `Re-draft` button is visually there but is overlapped by the pill strip, making the click target ambiguous. Whether it's actually clickable I did not verify (would trigger a re-draft job / consume Bedrock).

---

## Not exercised (would change data — need your green light)

- Actually **uploading** a file / capturing a URL (would create a nectar_documents row + Bedrock parse job).
- Clicking `Draft requirements` on a parsed source (would create draft requirements).
- Clicking `Pre-fill 33 with NECTAR` (would call the applicability pre-fill mutation on 33 rows).
- `Confirm requirement`, `Confirm 24 selected`, `Confirm removal`, per-row `Remove`, `Unconfirm`, `Re-open for review`, `Attest external completion`, `Ask NECTAR to propose`, `Explain in plain language`, `Save` in Add manual requirement.
- Trash icons on authorized-code rows.
- Approving / Skipping / Removing inside the Review queue walkthrough.

Tell me which of these you want me to exercise and I'll re-test with your OK, or tell me which findings above you want turned into fixes and I'll switch to build mode.
