## Add "Draft with NECTAR" to historical timesheets (only when shift note is missing)

Mirror the time-clock Draft-with-NECTAR pattern inside each pending historical-timesheet card, but ONLY show the panel when the entry has no shift note yet.

### File to change
`src/routes/dashboard.my-historical-timesheets.tsx` — `EntryCard` only. No new server functions, no schema changes.

### Visibility rule
Render the NECTAR panel only when the shift note is missing:
- `!row.shift_note_text?.trim() && !note.trim()`
- Once the user accepts a draft (or types anything into the note), the panel hides.

### Behavior (identical to punch-pad flow)
1. Above the existing "Shift note" textarea, render a NECTAR Infusion-locked amber dashed panel: "NECTAR Infusion / Draft with NECTAR" header + short helper text.
2. Panel contents:
   - Shorthand textarea (rows=3, maxLength 4000, same placeholder as punch-pad).
   - "Draft with NECTAR" button (disabled until 3+ chars, spinner while busy).
   - "Speak shorthand / Stop voice" mic button, only when `SpeechRecognition` / `webkitSpeechRecognition` is available.
3. On click, call the existing `draftShiftNote` server fn with:
   - `shorthand`: textarea text
   - `goals`: `[]` (historical rows have no live PCSP goal picker)
   - `clientFirstName`: `row.clients?.first_name` (fallback "the client")
4. Returned draft renders in a "NECTAR draft — review before confirming" card with:
   - **Use draft & edit below** → sets `note` state to the draft (marks dirty; user still clicks Save note, then Confirm).
   - **Discard draft** → clears the draft panel and shorthand.
5. Show an "AI-drafted — your review required" chip next to the "Shift note" label while a draft has been accepted but not yet edited, matching punch-pad's `nectarUsed` badge.
6. Errors surface via toast using the server fn's message (credits, rate limit, etc. already handled).

### Gating
Wrap the panel in `<NectarInfusionLock featureName="Draft with NECTAR" benefit="…same copy as punch-pad…">` so tenants without the add-on see the same upsell.

### Out of scope
- No changes to save / flag / confirm logic.
- No goals selection UI.
- No changes to `draftShiftNote` or any other server function.
- No DB migration.
