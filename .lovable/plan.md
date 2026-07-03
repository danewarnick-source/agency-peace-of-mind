# Goal

Clicking **Draft requirements** on a Scope of Work in Authoritative Sources must:
1. Return immediately (no 5–10 min single call).
2. Show "Reading section X of Y…" progress as it works.
3. Persist per-section progress in the database so a crash / tab close / reload never re-pays for a section already read.
4. Auto-resume on next page load / next click, skipping completed sections.

# What already exists (verified)

- **DB queue:** `nectar_draft_jobs` with `chunk_ranges`, `processed_indices`, `processed_chunks`, `extracted_items`, `chunk_failures`, `chunk_durations_ms`, `status` (`extracting` → `ready_for_review` → `completed`/`failed`).
- **Three server fns** in `src/lib/authoritative-sources.functions.ts`:
  - `startRequirementsDraft` — pre-chunks the raw text, inserts the job row, returns `{ jobId, totalChunks }` in one quick call.
  - `processDraftChunk({ jobId, chunkIndex })` — runs the AI on one chunk, appends to `extracted_items`, records the index in `processed_indices`. Idempotent — a second call on the same index returns `skipped:true` and does NOT call the AI (this is the "don't pay twice" guarantee).
  - `finalizeRequirementsDraft({ jobId })` — dedupes and inserts requirements once every chunk is done.
- **Global driver:** `src/components/nectar/draft-jobs-driver.tsx` (`DraftJobsProvider`) mounted in `src/routes/dashboard.tsx` polls `getActiveDraftJobs` every 5s, runs 3 parallel `processDraftChunk` calls per active job, then finalizes. On mount it picks up any still-`extracting` job from a previous session — that's the resume path.
- **Server-side tick:** `runDraftTick` in `src/lib/nectar-draft-tick.server.ts` + public route `/api/public/hooks/nectar-draft-tick` process chunks server-side within a 45s budget. `startRequirementsDraft` fires it once at start; the client `visibilitychange`/`pagehide` nudge is currently a **documented no-op** (`NOTE: intentionally no-op for now`).

The pieces are there; the failure mode you're seeing is either the driver not actually engaging on this SOW, or the UI not surfacing the per-chunk progress clearly enough to look like anything other than "one long run".

# Plan

## 1. Diagnose the specific SOW (do this first, before touching code)

Open browser DevTools with Authoritative Sources loaded and click **Draft requirements** on the Scope of Work. Confirm in Network / Console:

- The `startRequirementsDraft` request returns within ~1–2s with `{ jobId, totalChunks: N }` (not a long-hanging request).
- Within 5s the `getActiveDraftJobs` poll picks up the new job, and `processDraftChunk` calls start firing (one per chunk, ~3 in flight).
- `nectar_draft_jobs` row shows `processed_indices` growing as each chunk finishes.

If any of the above is missing, that's the real bug — likeliest suspects, in order:
- `startRequirementsDraft` returning `jobId: null` (no_text / non_obligation_kind) — surface `message` clearly.
- `DraftJobsProvider` context not reaching the Authoritative Sources tree (double-check the route is under the dashboard shell — it is, per `src/routes/dashboard.authoritative-sources.tsx` under `_authenticated` via dashboard).
- Driver crashing on a chunk because the AI gateway 429s and the loop bails — currently we `doneSet.add(i)` on failure to avoid infinite retry, so this shouldn't strand the job, but confirm.

I'll report the actual observed sequence before applying fixes 2–4.

## 2. Make progress explicit: "Reading section X of Y"

Change the button/progress label copy in `src/components/pages/authoritative-sources-page.tsx` (the `draftingLabel` computation) and in `src/components/nectar/draft-jobs-driver.tsx` (`DraftJobProgress` — expose `processedChunks` / `totalChunks` explicitly, which it already does).

New label shape:
- While extracting: `Reading section {processedChunks + 1} of {totalChunks}…` (+ ETA if measured, e.g. `· ~2m 10s left`).
- While finalizing: `Finalizing {totalChunks} sections…`.
- Same treatment on the "Re-draft" button.

Show a toast on start: `NECTAR started reading "{title}" — {totalChunks} sections. Progress saves as it goes; safe to leave the page.`

## 3. Keep background progress moving when the tab is hidden

Replace the current no-op nudge in `DraftJobsProvider` with a real authenticated server-fn call:

- Add a tiny `nudgeDraftJob({ jobId })` server fn (auth-middleware, org-membership check on the job) that just calls `fireDraftTick(jobId, { wait: false })` and returns `{ ok: true }`.
- Call it via `useServerFn` from the existing `visibilitychange:hidden` / `pagehide` handler for each active job (debounced as today).
- Keep the server-side `runDraftTick` bounded at 45s / concurrency 3 — no changes needed.

This means: user starts the draft, closes the tab, comes back 10 minutes later, and finds the job already partway (or fully) done — with zero re-pays because each chunk is guarded by `processed_indices`.

## 4. Prove the "don't pay twice" guarantee

Add an assertion-style test path only visible in dev (or a short manual verification checklist):

- Start a draft on the SOW.
- Kill the tab mid-way (say, after 5 chunks).
- Query `nectar_draft_jobs`: confirm `processed_indices` has 5 entries and `extracted_items` has the results.
- Reload Authoritative Sources.
- Confirm the driver resumes at chunk 6 (via a `console.debug` in `runWorker` on the first skipped index — `[nectar-draft] resuming job {jobId} at chunk {i}, skipping {N} already-processed`).
- Confirm the AI Gateway logs show N fewer calls than total chunks.

No new billing table needed — `processed_indices` is already the record.

## 5. Minor UX polish (only if diagnosis confirms the core flow works)

- On the Authoritative Sources page, if any job for the current org is `extracting`, render a small persistent status strip at the top summarizing active jobs and their per-section counters, so the user sees progress even when scrolled away from the specific row.
- Wrap the "Draft requirements" button in a tooltip that reads: `Reads the document in ~30s chunks. Progress is saved after every section — closing the tab is safe.`

# Out of scope

- Rewriting the extractor prompt or chunk size — not needed for this ask.
- Migrating to a dedicated queue (BullMQ etc.) — `nectar_draft_jobs` + the tick endpoint already function as the queue.
- Touching `generateRequirementsFromSource` (the old monolithic fn) — it's no longer wired to the button; leave it as dead-but-referenced until a later cleanup pass.

# Files that will change

- `src/components/pages/authoritative-sources-page.tsx` — progress label copy, start-toast copy, optional status strip.
- `src/components/nectar/draft-jobs-driver.tsx` — expose `Reading section X of Y` state, wire real nudge on visibility change.
- `src/lib/authoritative-sources.functions.ts` — add `nudgeDraftJob` server fn (thin wrapper over `fireDraftTick`).

No schema migration required.
