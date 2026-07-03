## Problem

Drafting a long SOW starts, creeps up (2% → …), then the page reloads or the user leaves and the client-side loop that was driving `processDraftChunk` dies. The job row in `nectar_draft_jobs` keeps its state, but nothing picks it back up. Even worse: if the user closes the tab, drafting stops entirely. And there is no ETA — users have no idea if it's minutes or hours away.

Fix: (a) make chunks idempotent so resume is safe, (b) run the loop from a global app-level driver so it survives route changes, (c) add true server-side background continuation so it keeps going with the tab closed, (d) surface a real estimated time remaining based on measured per-chunk timings.

## Fix

### 1. Idempotent chunks + resume + timing metadata

Add to `nectar_draft_jobs` (migration + `docs/SQL_HANDOFF.md`):

- `processed_indices int[] not null default '{}'` — which chunk indices are done.
- `started_at timestamptz not null default now()` — when the first tick began work.
- `chunk_durations_ms int[] not null default '{}'` — one entry per completed chunk, for ETA.

`processDraftChunk` in `src/lib/authoritative-sources.functions.ts`:
- If `chunkIndex` already in `processed_indices`, return current counters — no AI call.
- Otherwise time the extraction and, in the same update, append the index to `processed_indices` and the elapsed ms to `chunk_durations_ms`.

New server function `getActiveDraftJobs()` — returns all `nectar_draft_jobs` for the caller's org with status `extracting`, each including `{ jobId, documentId, documentTitle, totalChunks, processedChunks, processedIndices, startedAt, chunkDurationsMs }`. Auth-gated the same way.

### 2. Global background driver (survives route changes)

New provider `src/components/nectar/draft-jobs-driver.tsx`, mounted once inside the authenticated dashboard shell:

- Polls `getActiveDraftJobs()` every 5s via `useQuery`.
- For each active job, runs a bounded-concurrency (3) loop over `[0..totalChunks-1]` skipping any index already in `processedIndices`, then calls `finalizeRequirementsDraft`.
- Publishes live `{ processed, total, progressPct, etaMs }` per `documentId` into a small React context store the source-row UI reads.
- Lives above the route, so navigating between dashboard pages does NOT stop drafting.
- On finalize, invalidates `["requirements", orgId]` / `["auth-sources", orgId]` and toasts once.

Per-source-row "Draft requirements" button becomes a thin trigger: call `startRequirementsDraft`, then the driver picks up the new job on its next poll. Button label reads `Drafting… N% · ~Xm Ys left`.

### 3. Server-side background continuation (survives tab close)

Public API route `src/routes/api/public/nectar-draft-tick.ts`:

- `POST { jobId }`, verified by HMAC header signed with a stored `NECTAR_DRAFT_TICK_SECRET` (via `secrets--add_secret`).
- Loads the job with `supabaseAdmin`, then loops: pick next unprocessed index, run the same extraction as `processDraftChunk`, append to `processed_indices` / `extracted_items` / `chunk_durations_ms`. Stops when either (a) all chunks processed → runs finalize inline, or (b) ~20s wall-clock elapsed to stay under the Worker CPU budget.
- Before returning, if work remains, calls itself via `fetch(sameOriginUrl, { method:'POST', keepalive:true, headers:{signature} })` inside `ctx.waitUntil(...)` (Cloudflare `waitUntil`) so the chain continues after the HTTP response is sent, with no client involvement.

`startRequirementsDraft` fires the first tick before returning so background work begins immediately.

Result:
- Tab open on Knowledge page → client driver + server ticks race; idempotency guard makes double-work a no-op.
- Tab on any other dashboard page → client driver still runs, server ticks also run.
- Tab closed → server ticks keep the job moving; next open shows the finished (or further-along) job.

### 4. Real ETA (not fake creep)

In the driver store, for each active job compute:

```
completed = chunkDurationsMs.length
if (completed >= 2) {
  // Use a trailing average over the last 8 chunks, weighted by real concurrency
  window = chunkDurationsMs.slice(-8)
  avgPerChunkMs = mean(window)
  effectiveConcurrency = min(3, totalChunks - processedChunks)
  remainingChunks = totalChunks - processedChunks
  etaMs = (remainingChunks * avgPerChunkMs) / effectiveConcurrency
} else if (completed === 1) {
  etaMs = chunkDurationsMs[0] * (totalChunks - 1) / 3
} else {
  // Before any chunk finishes, fall back to elapsed-since-startedAt with a
  // conservative "still measuring…" label instead of a number.
  etaMs = null
}
```

Format: `~2m 15s left` when `>= 60s`, `~45s left` when `< 60s`, `still measuring…` when `etaMs === null`, and hide entirely when `processedChunks === totalChunks` (finalizing). Because timings are read from the job row, ETA is correct whether the user just opened the page or was watching all along, and it survives reloads.

### 5. UX

- Persistent header pill: `Drafting N sources · ~Xm Ys left` (min ETA across active jobs), links to Knowledge.
- Source row button states:
  - No job: `Draft requirements` (or `Re-draft` if drafted before).
  - Active: `Drafting… N% · ~Xm Ys left` (disabled).
  - Failed: `Resume drafting` (re-fires a tick).

## Out of scope

- Cross-org admin views of job history; retry beyond the existing "split in half" retry in `extractChunkWithRetry`; replacing the client driver with pure server ticks (kept as belt-and-suspenders for snappier updates when the tab is open).

## Files touched

- `docs/SQL_HANDOFF.md` and a new `supabase/migrations/*.sql` — add the three columns.
- `src/integrations/supabase/types.ts` — regenerated columns.
- `src/lib/authoritative-sources.functions.ts` — idempotency + timing in `processDraftChunk`; new `getActiveDraftJobs`; `startRequirementsDraft` fires first tick.
- `src/lib/nectar-draft-tick.server.ts` (new) — signed tick loop + self-chaining via `waitUntil`.
- `src/routes/api/public/nectar-draft-tick.ts` (new) — HMAC-verified POST route.
- `src/components/nectar/draft-jobs-driver.tsx` (new) — polling, concurrency loop, progress+ETA store.
- Authenticated dashboard shell — mount the driver once.
- `src/routes/dashboard.authoritative-sources.tsx` — remove per-row loop; read progress/ETA from store; new button labels.
- Secret: `NECTAR_DRAFT_TICK_SECRET`.

## Success check

Start a draft on the 260k-char SOW. Within ~10s the button shows `Drafting… N% · ~Xm Ys left` with a plausible ETA. Navigate to another dashboard page — the header pill keeps counting down. Close the tab, wait a couple minutes, reopen — the job is further along or done and requirements from the later sections are visible in the Requirements list.
