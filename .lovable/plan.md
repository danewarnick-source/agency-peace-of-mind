## What's actually happening

The "92%" is a fake progress bar in `src/routes/dashboard.authoritative-sources.tsx` (line 521). It creeps toward 92 % and only snaps to 100 % when the server call returns. Stuck at 92 % means the single server call — `generateRequirementsFromSource` in `src/lib/authoritative-sources.functions.ts` — never returns before the platform kills it.

For a 260 000-character SOW that one call has to:

1. Split the text into ~9 chunks.
2. Make ~9 Gemini calls (currently 3 in parallel — so ~3 rounds).
3. Dedupe against existing requirements and batch-insert.
4. Emit one HIVE ticket per unmapped requirement and per unknown service code (dozens of extra server round-trips).
5. If assisted mode is on, call `markDraftedByNectar` per inserted row.

All in one server-function invocation. On a long SOW that easily blows past the worker's wall-clock, so the client just sits at 92 % forever.

## Fix — split the one giant call into a job the client drives step by step

Turn drafting into a small state machine backed by a job row. Each server call does a bounded amount of work (one AI chunk, or one batch of DB writes), returns, and the client asks for the next step. The progress bar becomes real — it moves as chunks actually finish — and no single call has to fit inside the wall-clock.

### 1. New table `nectar_draft_jobs`

Sent through `docs/SQL_HANDOFF.md` (Lovable Cloud rules — no direct DB access).

Columns:
- `id uuid pk`, `organization_id uuid`, `document_id uuid`, `created_by uuid`
- `status text` — `queued | extracting | inserting | done | failed`
- `total_chunks int`, `processed_chunks int default 0`
- `chunk_texts jsonb` — array of the pre-split window strings (populated at start; read one at a time)
- `extracted_items jsonb default '[]'` — accumulated `{title, description, category, citation, applies_to}` objects
- `chunk_failures jsonb default '[]'` — per-chunk failure notes
- `inserted_count int default 0`
- `error_message text`
- `created_at`, `updated_at`

RLS: org-scoped via `is_org_admin_or_manager(organization_id)`. Full GRANT block per the public-schema-grants rule (`authenticated`, `service_role`).

### 2. Three narrow server functions replacing the monolith

In `src/lib/authoritative-sources.functions.ts` (or a new `nectar-draft-jobs.functions.ts` — I'll put them alongside so the route import surface stays small):

- `startRequirementsDraft({ documentId })`
  - All the preflight `generateRequirementsFromSource` already does (role check, `is_authoritative_source`, `NON_OBLIGATION_KINDS`, `no_text`).
  - Chunk the raw text via `chunkDocumentText` (already in `authoritative-sources.server.ts`).
  - Insert a `nectar_draft_jobs` row with `chunk_texts`, `total_chunks`, `status='extracting'`, `processed_chunks=0`.
  - Return `{ jobId, totalChunks, reason: 'ok' | 'no_text' | 'non_obligation_kind' | ... }` so existing early-exit UX is unchanged.

- `processDraftChunk({ jobId, chunkIndex })`
  - Load job, run `extractChunkWithRetry` on `chunk_texts[chunkIndex]`.
  - Append items to `extracted_items`, append any failures to `chunk_failures`, `processed_chunks++`.
  - Return `{ processed, total, chunkFailures: newFailuresThisCall }`.
  - One AI call per invocation — safely inside the wall-clock even on the worst chunk.

- `finalizeRequirementsDraft({ jobId })`
  - Dedupe accumulated `extracted_items` against existing `nectar_requirements.requirement_key`.
  - Batch-insert in groups of 100 (already the existing shape).
  - Set `status='done'`, `inserted_count`.
  - Return `{ inserted, chunkCount, chunkFailures, reason: 'ok' | 'partial' | 'extractor_incomplete' | 'no_requirements' }` — matches today's response shape so the toast copy doesn't change.
  - The HIVE-ticket emissions (`reportPlatformEvent` for `ai_error`, `no_requirements_found`, `requirement_unmapped`, `unknown_code_structure`) all move here. Two cleanups while I'm here so this step is fast:
    - Import `reportPlatformEvent`'s underlying helper directly instead of calling it as a server-fn from another server-fn (the current pattern hits the "Server function info not found for &lt;hash&gt;" published-build failure documented in `tanstack-server-functions`). If a plain helper doesn't exist yet, I'll extract one into `hive-tickets.server.ts`.
    - Same treatment for `markDraftedByNectar`.

### 3. Client drives the loop

In `src/routes/dashboard.authoritative-sources.tsx` around the current `generate` mutation (lines 488–535):

- Kill the fake `useEffect` that creeps to 92 %.
- New flow inside the mutation:
  1. `start = await startRequirementsDraft(...)` → get `jobId` and `totalChunks`. Early-exit reasons (`no_text`, `non_obligation_kind`) short-circuit exactly like today.
  2. Run a bounded-concurrency loop (limit 3, same as today's server concurrency) over `0..totalChunks-1` calling `processDraftChunk`. After each returned call: `setProgress(Math.round((processed / total) * 90))` — real progress capped at 90 % so the finalize step has room.
  3. `finalize = await finalizeRequirementsDraft({ jobId })` → move to 100 % and show the existing success/warn toast with `inserted` / `message`.
- Errors surface per step; a failure in step 2 leaves the job row intact, so clicking Draft again with an "existing job?" resume path is an easy follow-up (out of scope for this fix — a fresh click just starts a new job).

### 4. Keep `generateRequirementsFromSource` as a shim (optional, cheap)

Rewrite it to call the three new fns in sequence, so any other caller (or the old client bundle in a cache) still works. Deletable once the client is redeployed.

## Files to touch

- `docs/SQL_HANDOFF.md` — migration for `nectar_draft_jobs` + GRANTs + RLS
- `src/lib/authoritative-sources.functions.ts` — add three new server fns, retire the monolith
- `src/lib/hive-tickets.server.ts` (new) — plain helper `reportPlatformEventDirect(...)` shared by the server-fn wrapper and the drafting finalizer
- `src/lib/nectar-approvals.server.ts` (new, if not already) — plain helper for `markDraftedByNectar`
- `src/routes/dashboard.authoritative-sources.tsx` — swap the mutation body, delete the fake-progress `useEffect`, real progress from the loop
- `src/integrations/supabase/types.ts` — regenerated for the new table

## Out of scope

- Resumable jobs across page reloads (job row exists, but resuming a half-finished job needs a UI affordance — not part of this fix).
- Changing what NECTAR extracts, how requirements are rendered, or the review flow.
- Auto-retrying failed chunks server-side beyond the existing single "split in half and retry" already in `extractChunkWithRetry`.

## Verification

- Draft on the 260 k-char SOW → progress bar moves in ~10 real jumps (one per chunk), never sticks, and the success toast reports a real requirement count.
- Draft on a short doc → completes in one or two updates, same UX as today.
- A parse-fail on one chunk → we still return `partial` with the accurate "X of N sections couldn't be read on this pass" message, and the successful chunks' requirements are inserted.
