## 1. Copy shifts (replaces "Repeat shifts")

**Button + dialog rename.** `Repeat shifts` → `Copy shifts` in `src/components/scheduler/nectar-bar.tsx` and `src/components/scheduler/repeat-shifts-dialog.tsx` (title, toasts, internal labels). The underlying server fns keep their names.

**New flow inside the dialog:**
- Source picker: `Previous week` / `Previous month` / `Pick a week…` (date input). No more "Day" mode and no "Repeat for next N" counter — target is always the **current visible week** (the `anchor` prop already passed in).
- **Weekday-aligned mapping.** A source-week Tuesday lands on the target-week Tuesday (not "+7 days from source"). For a previous-month source, copy each shift onto the same weekday in the current week (first matching weekday). Implemented in `repeat.functions.ts` by changing `projectShifts` to compute, per shift, `targetDay = targetWeekStart + ((sourceDate.getDay() - targetWeekStart.getDay() + 7) % 7)` and preserving time-of-day.
- Each shift's `staff_id`, `client_id`, `service_code`, `starts_at` time-of-day, `ends_at` time-of-day, `is_awake_overnight`, `notes` are preserved verbatim. `keep_staff` defaults on; `skip_if_exists` stays.
- Drafts land **unpublished** (already the case: `published: false`, `created_from: "copy"`). Preview table gets per-row checkboxes so admins can deselect before Apply, plus a `Publish now` toggle that flips `published: true` on insert for the selected rows (quick-publish path).
- **Empty state copy.** When the source window has zero shifts, the preview area shows exactly: *"No shifts to repeat from."* Apply button is disabled.

**Files:**
- edit `src/lib/scheduler/repeat.functions.ts` — replace day-offset projection with weekday-aligned projection; accept `publish_now: boolean`; pass through `include_source_ids` for row-level deselect.
- edit `src/components/scheduler/repeat-shifts-dialog.tsx` — new source picker, per-row checkboxes, Publish-now toggle, empty-state string.
- edit `src/components/scheduler/nectar-bar.tsx` — button label + icon stays `Repeat` (lucide) but text is `Copy shifts`.

`createRecurringShifts` (used by Add Shift recurrence) is untouched.

## 2. Import schedule (Nectar file ingest)

**New button** `Import schedule` next to `Copy shifts` in `nectar-bar.tsx`. Opens a new dialog `src/components/scheduler/import-schedule-dialog.tsx`.

**Dialog UX:**
1. File input accepts `*/*` (PDF, image, .docx, .xlsx, .csv, .txt). Single file at a time.
2. On upload, POSTs to a new server fn `nectarImportSchedule` (in `src/lib/scheduler/import.functions.ts`).
3. Server returns the same `Draft[]` shape Nectar already produces, so the existing review/apply path in `nectar-bar.tsx` renders the rows. Reuses `applyDrafts` — no new write path.
4. Anything Nectar can't match returns `staff_id: null` / `client_id: null` with a `flags: ["unmatched staff: 'Jane D.'"]` style note. Hard-unmatched rows (no client) are uncheckable in the existing table (already enforced by `hard` flag).
5. On read failure (corrupt PDF, unreadable image, oversize), toast the error and close — no partial drafts.

**Server fn — `nectarImportSchedule`:**
- `requireSupabaseAuth` middleware.
- Input: `{ organization_id, file_name, file_mime, file_b64, week_start_iso }`. 10 MB cap.
- Loads org staff + clients + active authorizations (same query the existing Nectar drafter uses in `setup.functions.ts` — extract to a shared `loadSchedulerCatalog()` helper).
- Calls Lovable AI Gateway via the same provider helper already in use for `nectarDraftShifts`. Multimodal: PDFs and images go as `image_url`/`file` content blocks per `ai-multimodal-input`; CSV/TXT/XLSX is parsed server-side first (papaparse for CSV, xlsx for spreadsheets, mammoth for .docx) and the extracted text is sent as a normal text prompt. No new dependency if the package is already in the tree — otherwise add `papaparse` and `xlsx` via `bun add`.
- Prompt instructs Nectar: only emit shifts for staff/client names that match the supplied catalog; for any unmatched name return the shift with `staff_id`/`client_id` null plus a `flag` explaining what wasn't matched. Never invent staff or clients. Codes must be one the matched client is authorized for, else flag.
- Returns `{ drafts: Draft[] }`.

**Wiring:**
- `nectar-bar.tsx` gets a third mode alongside `drafts` / `proposals`: import results reuse the `drafts` branch (same review table, same Apply button → same `applyDrafts`).

**Files:**
- new `src/components/scheduler/import-schedule-dialog.tsx`
- new `src/lib/scheduler/import.functions.ts`
- edit `src/components/scheduler/nectar-bar.tsx` — new button + dialog state.
- edit `src/lib/scheduler/setup.functions.ts` — export `loadSchedulerCatalog()` helper if needed for reuse.

## 3. Expandable approval / out-this-week refinement

Current `requests-panel.tsx` already renders the two collapsed cards with counts and a right-side detail pane. Small tweaks to match the request wording:

- Replace `ChevronRight` with a rotating chevron that visibly turns down when its card is expanded (purely visual cue that "click the arrow expands").
- When neither card is expanded on desktop, hide the empty placeholder column entirely so the two cards sit compactly at the top of the column instead of next to a "Select a box…" panel.
- Counts remain visible in the collapsed state (already done).

**File:** edit `src/components/schedule-preview/requests-panel.tsx` only.

## Out of scope
- No changes to scheduler grid layout, colors, billing math, conflict engine, EVV logic, or caseload tooling.
- No DB schema changes. No new tables, columns, or RLS policies.
- No changes to `createRecurringShifts` or the Add Shift recurrence UI.
- Nothing auto-publishes except the new opt-in "Publish now" toggle inside Copy shifts (admin-driven, one click).
