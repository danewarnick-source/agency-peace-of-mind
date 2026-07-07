# Extend NECTAR fit-scoring across all whiteboard containers

## Goals

- Widen `scoreComposition` to consume **notes**, **PCSP fields**, and **staff qualifications**, in addition to the current stored signals (capacity/age/med load).
- Score all three container shapes: **RHS**, **HHS host homes**, **Direct-Support slots** (real + scenario).
- Render a **green→red glow gradient** driven by fit, with a reasoning strip beneath every container: driving factors + honest "unscored" list.
- Preserve the no-fabrication rule: no signal → say so, don't guess.
- Out-of-code placements remain drops-allowed and flagged as risk (already implemented).

## Deliverables

### 1. New shared scorer module — `src/lib/whiteboard-scoring.ts`

Pure functions, no I/O. Reuses and extends the existing `scoreComposition` output shape (`{ light, hard_blocks, risks, ... }`) with:

```ts
type ScoreFactor = { kind: "positive" | "risk" | "block"; text: string; source: "stored" | "notes" | "pcsp" | "staff-qual" | "coverage" | "code-match" };
type ContainerScore = {
  light: "green" | "yellow" | "red" | "neutral";
  intensity: number;         // 0..1 → glow strength (drives gradient)
  factors: ScoreFactor[];    // reasoning shown beneath container
  unscored: string[];        // honest "couldn't evaluate" list
};
```

Exports:
- `scoreRhsContainer({ home, clients, staff, notesByKey, staffQuals, unscoredBase })`
- `scoreHhsContainer({ host, clients, staff, notesByKey, staffQuals, billingCodesByClient })`
- `scoreDsContainer({ client, staff, notesByKey, staffQuals, billingCodesByClient })`

Shared sub-scorers, each returns `ScoreFactor[]` + `unscored[]`:
- `scoreNotes(notesByKey, subjects)` — token-match conflict/friction/preference patterns on note text; flags:
  - client-client conflict: "doesn't work with", "conflict with", "avoid" + another placed client's first/last name
  - client-staff friction: "dislikes X" on client + "X" appears in staff note (smells/cologne/loud/etc.), symmetric scan
  - positive: "gets along with", "prefers", "responds well to" naming a placed peer
  - insufficient: subject has zero notes → add to unscored as `"No notes for <name>"`
- `scorePcsp(clients)` — for each placed client, check `pcsp_goals`, `special_directions`, `pertinent_health_notes`, `preferred_living`, `preferred_activities`; if all null/empty, unscored; otherwise surface as positive/risk factors where clear tokens match container type (e.g. `preferred_living: 'host home'` in an RHS = risk).
- `scoreStaffQuals(clients, staff, staffQuals, billingCodesByClient)` — for each placed client's authorized codes, check if any placed staff has the qualification. Missing = risk factor; present = positive. No qual data for a staffer → unscored.
- `scoreCoverage(clients, staff, billingCodesByClient)` — HHS + DS only: sum authorized weekly hours per client; naive check that at least 1 staff present per client with authorized time > 0. Deep hours-vs-availability check is out of scope (unscored: "Weekly hour coverage math (staff schedules not modeled in sandbox)").
- `scoreCodeMatch(clients, containerKind)` — the existing out-of-code check (HHS client in RHS, etc.).

Light + intensity derivation: `blocks` present → red@1.0; else weight = risks*0.3 - positives*0.2, clamp to [-1,1]; map: `<= -0.4` green (strong), `-0.4..0.2` yellow, `> 0.2` red; intensity = |weight|. If factor list is empty AND unscored covers all axes → neutral, intensity 0 ("insufficient signal").

Keep `scoreComposition` (rhs-board-scoring.ts) intact and call it inside `scoreRhsContainer` for the stored-signal portion; merge its output into `factors`/`unscored`.

### 2. New server fn — `src/lib/whiteboard-scoring.functions.ts`

- `getBoardScoringInputs({ organization_id })` → returns:
  - `pcspByClient: Record<clientId, { pcsp_goals, special_directions, pertinent_health_notes, preferred_living, preferred_activities }>` for all org clients
  - `staffQualsByStaff: Record<staffId, { code: string; qualified: boolean }[]>` — reuse existing `getStaffQualifications` shape if it exists, else read from staff_types/certifications join. Investigate before writing.
  - `billingCodesByClient: Record<clientId, { code, weekly_units, unit_type, active }[]>` from `client_billing_codes` where active.
- `getAllNotesForBoard({ organization_id })` → all `whiteboard_notes` rows for the org (subject_type, subject_id, note_text). One query keyed for client-side grouping. This avoids N popovers of `listWhiteboardNotes` for scoring.

Both are `.middleware([requireSupabaseAuth])` and RLS-scoped by org membership.

### 3. Wire into `planning-board.tsx`

- Add two `useQuery` calls for the new fns; add both to `useMemo` inputs.
- Replace the local `scoreByHome` with a general `scoresByContainer: Map<containerId, ContainerScore>` computed for every RHS home (real + scenario), every HHS host (real + scenario), and every DS container (real + scenario slot).
- Existing `RhsHomeContainer` already takes a `MoveScore`; adapt the shape or extend the prop to accept `ContainerScore`. Simplest: give each container component a `score: ContainerScore | null` prop and render:
  - Gradient border/background driven by `light` + `intensity` (e.g. inline style with `hsl` interpolation between emerald→amber→rose, alpha = intensity).
  - **Reasoning strip** beneath the container body listing factors grouped by kind (blocks → risks → positives) with a source badge, followed by a muted "Unscored" list.
- Update `HhsHostContainer` and `DirectSupportContainer` / `DsSlotContainer` to render the same reasoning strip.

### 4. Reasoning UI component — inside `planning-board.tsx`

Small `ScoreReasoning` component:

```tsx
<div className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[10px]">
  {factors.map(f => <FactorRow ... />)}
  {unscored.length > 0 && (
    <div className="rounded bg-muted/40 px-1.5 py-1 text-muted-foreground">
      <Info /> NECTAR could not evaluate: {unscored.join(" · ")}
    </div>
  )}
</div>
```

Icon per kind: block = AlertTriangle rose; risk = AlertTriangle amber; positive = CheckCircle emerald.

### 5. Investigation before build

Small look-ups (no writes):
- Confirm `getStaffQualifications` exists and its return shape.
- Confirm `clients.pcsp_goals` etc. column names & types.
- Confirm `client_billing_codes` columns for weekly hours / unit type / active flag.
- Confirm `whiteboard_notes` list-all-for-org fetcher — reuse if present, else write it.

## Technical notes

- Note-text parsing stays intentionally simple (token/regex on lowercased text). It is heuristic and every match is surfaced as a factor with the quoted note snippet so the admin sees why NECTAR flagged it.
- Scenario containers (synthetic RHS/HHS/DS) score exactly like real ones — inputs are placed-subject IDs, not container source.
- All new logic is client-side computed from server-fetched inputs; no server-side scoring.
- No DB migrations required.

## Out of scope (explicitly)

- Real schedule/availability math for coverage (surfaced as unscored).
- LLM-assisted note interpretation.
- Persisting scoring output.

## Report at end

- Signals now scored per container type.
- Confirm reasoning strip renders (color + factors + unscored) beneath all 3 shapes.
- Confirm out-of-code placements flag as risk without blocking.
