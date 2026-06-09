# Add "Ask NECTAR to schedule" to Residential Coverage

Mirror the Individual Services dialog into the Residential **Builder** tab so a user can describe coverage in plain English, preview what NECTAR proposes, and confirm to drop it in as **drafts** — Publish stays a deliberate, separate step (the same contract as Individual Services).

## Where it goes

`src/components/scheduling/schedule-builder.tsx`, in the action row that already holds **NECTAR draft / Copy last week / Clear / Publish**. New button: **"Ask NECTAR to schedule"** (wand icon), placed immediately before the existing `NECTAR draft` button so the freeform path sits next to the auto-fill path.

The Individual Services tab is not touched.

## UX (same shell as Individual Services)

Identical dialog component shape — same header, textarea, parse button, "needs clarification" amber card, preview card, and **Confirm & save drafts** CTA. Same wording template: *"NECTAR proposes draft blocks — nothing publishes until you choose to."*

Behavior parity:
- Sentence in → preview out, or a single clarifying question if ambiguous.
- Confirm writes **draft cells only** (does not call the publish mutation).
- Toast on success: *"NECTAR proposed N slot(s). Review and Publish when ready."*
- No auto-publish anywhere.

## What changes in the residential domain

The unit of work in the Builder is `(home unit) × (band) × (day) × (slot index) → staff_id`, not a freeform shift. So NECTAR's output for this surface is a list of slot picks, not `(client, code, time)`.

A new server function `parseCoverageSentence` (sibling of `parseScheduleSentence`) in `src/lib/nectar-schedule-parse.functions.ts`:

- Input reference set: the current home's `units` (key + client names), `bands` (id + label + start/end), `weekDays` (ISO), and the eligible `staff` pool (home team first, then org fallback — same pool the existing `nectarDraft` already uses).
- Output (strict JSON):
  - `{ kind: "ask", question }`, or
  - `{ kind: "ok", picks: [{ unit_key, day_iso, band_id, staff_id }], summary }`
- Same gateway call, same model (`google/gemini-3-flash-preview`), same 429/402 handling, same advisory tone.

Server rules the prompt enforces:
- Resolve staff and home/unit by case-insensitive name match against the provided lists.
- Resolve days from phrases like "Mon–Fri", "weekends", "every day".
- Resolve bands by name ("overnight", "morning", "afternoon", "evening") or by start time matching a band's `start_time`. If ambiguous (e.g. the home has two morning bands), return `ask` with a single specific question listing the band labels.
- Never overwrite an existing assignment; only propose into empty slots. If every matching slot is already filled, return `ask` with: *"All matching slots are already covered — clear them first or pick a different band."*
- Honor `staffNeeded` per unit per band (one staffer per slot index; do not double-book a staffer in the same `(day, band)` across units, same constraint `nectarDraft` already uses).

## Wiring on confirm

`AskNectarCoverageDialog` mounts inside `ScheduleBuilder` so it has direct access to `assignments`, `drafts`, `setAssignment`, `units`, `bands`, `weekDays`, and the staff pool. On **Confirm & save drafts**:

```text
for each pick in result.picks:
  key = assignmentKey(pick.unit_key, pick.day_iso, pick.band_id, nextOpenSlotIndex)
  if assignments.get(key) is empty:
     setAssignment(key, pick.staff_id)
     drafts.add(key)            // marks cell as a draft (orange dashed border)
```

This is exactly the same draft mechanism the existing **NECTAR draft** button uses, so cells render the same way, edit the same way, and clear the same way. Publish remains the existing Publish button — unchanged.

## Files

- **Edit** `src/lib/nectar-schedule-parse.functions.ts` — add and export `parseCoverageSentence` + types (`NectarCoveragePlan`, `NectarCoverageResult`). Keep `parseScheduleSentence` untouched.
- **Edit** `src/components/scheduling/schedule-builder.tsx` — add `AskNectarCoverageDialog` component (modeled on `AskNectarDialog` in `individual-services-scheduler.tsx`), wire a new "Ask NECTAR to schedule" button in the existing action row, render the dialog, and apply confirmed picks via `setAssignment` + draft marking.

## Guardrails

- Reuse the existing draft/publish flow, slot keying, staff pool, bands, and units — no schema changes, no new routes, no new roles.
- Individual Services scheduler, Coverage tab, Homes & Teams tab, and Publish behavior are not modified.
- NECTAR never auto-publishes; the Publish button remains the only path to write published shifts.
- Advisory only: errors from the gateway (429 / 402 / validation) surface in the dialog with the same wording style as Individual Services.

## Acceptance

- Residential Builder shows a new **Ask NECTAR to schedule** button next to NECTAR draft.
- Typing *"Cover the Maple house overnight Mon–Fri with Sarah"* yields a preview listing the (home / band / days / staff) it will fill; Confirm drops draft cells onto the grid (orange dashed) without publishing.
- Ambiguity (unknown staffer, no matching band, all slots already covered) returns a single clarifying question — the dialog stays open for the user to edit and re-parse.
- Confirmed picks are drafts; nothing appears on staff schedules until the existing **Publish** button is pressed.
- Individual Services "Ask NECTAR" looks and behaves identically to before; same dialog shell on both surfaces.
