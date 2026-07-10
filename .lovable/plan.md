## Goal

Collapse today's six client-profile tabs (Profile / Care / Activity / Funds / Files / PCSP) into **four editable tabs** — Identity, Care plan, Billing, Files — with every piece of information having exactly one editable home. Activity stays where it is. Operations and Compliance move out into their own separate areas (siblings to the four, not merged).

## New tab layout

```text
Identity        Care plan       Billing         Files       | Activity   Operations   Compliance
────────        ─────────       ───────         ─────       | ────────   ──────────   ──────────
Header card     ├─ Goals        Authorized      Uploaded    | Shifts     Meal planner Summaries
Demographics    └─ Medications  codes + rates   documents   | Daily logs Chore chart  Host-home certs
Guardian /                      Annual auth     (incl.      | Incidents  Caseload     Deadlines
 emergency                       units          PCSP docs)  |
Support coord.                  Budget / funds
Admission date
```

The four consolidated tabs are the only editable homes for the data they show. Activity / Operations / Compliance are additional top-level tabs, unchanged in content but re-scoped so each holds only what it says on the tin.

## Tab-by-tab content

**Identity** — sole home for name, DOB, Medicaid #, guardian, emergency contacts, support coordinator, admission date.
- Keep: `UpdateInfoFromDocumentCard`, `ClientProfileTab` (profile-tab.tsx).
- No change to the fields themselves; admission date already renders correctly here (Profile-tab fmtDate is the good one).

**Care plan** — two sub-tabs, both reading through `useClientCareData`:
- **Goals** — `PlanGoalsPanel` + `ClientSpecificTrainingCard` (structured PCSP goals with editable job codes). This is the ONLY place PCSP goals appear as editable rows.
- **Medications** — `MarEmarTab` (medication list + eMAR when enabled), gated by `showEmarSubTab` today. When gate is off, show medications list only (still via shared hook).

**Billing** — sole home for authorized codes, per-code rates, annual authorization units, budget/funds.
- Keep: `BillingCodesPanel`, `ClientBudgetPanel`.
- Add annual auth units display (already in `client_billing_codes`, currently shown as duplicate on PCSP tab).

**Files** — sole home for uploaded source documents.
- Keep: `ClientDocumentsCard`.
- Absorb the PCSP-tab document upload/viewer surface — after this change, PCSPs are just documents that live in Files (with a `kind = 'pcsp'` filter chip in the existing card).

**Activity** (unchanged): `ShiftsPanel`, `DailyLogsPanel`, `IncidentsPanel`.

**Operations** (new sibling tab, holds today's Care > Ops + PCSP-derived non-goal supports):
- `SupportStrategiesPanel`, `PersonCenteredProfilePanel`, `CaseloadEditor`, `ClientMealPlannerMount`, `ChoreChartForClient`.

**Compliance** (new sibling tab): `SummariesPanel`, `HostHomeCertPanel` (when host-home), `DeadlinesPanel`.

## Duplicates removed

The **PCSP tab is deleted entirely.** Its three data surfaces get exactly one home each:
- PCSP goals → Care plan > Goals (only).
- Authorized codes / rates / annual units → Billing (only). Removed from PCSP tab.
- Admission date → Identity (only). Removed from PCSP tab (this was the timezone-bug tab).
- The PCSP document itself → Files (kind = pcsp).

Nothing in this change touches read paths — every consolidated tab already reads through the shared `useClientCareData` hook from Prompt 1, so the removals just delete duplicate render code, not queries.

## Technical notes

- File edited: `src/routes/dashboard.clients.$clientId.tsx` — tab list rewritten; `TabsContent value="pcsp"` block deleted; `care` block restructured to `goals` + `medications` sub-tabs; `funds` renamed to `billing`; new `operations` and `compliance` `TabsContent` blocks moved out of Care/Activity.
- File deleted: `src/components/clients/pcsp-tab.tsx` (its remaining useful pieces — structured goals editor, doc upload — already exist elsewhere via the shared hook and `ClientDocumentsCard`).
- Route param `tab` values change (`profile→identity`, `care→care-plan`, `funds→billing`, `pcsp` gone). Add a small redirect map at the top of the route so old bookmarks (`?tab=profile`, `?tab=pcsp`) land on the right new tab.
- `setTab("files")` callsite in `ClientProfileTab` keeps working (Files tab still exists).
- No schema changes. No changes to `useClientCareData` — this is a pure UI reorganization on top of Prompt 1.
- After edits, run `npm run build` per repo rules so `routeTree.gen.ts` stays in sync, then verify (a) no `pcsp` tab renders, (b) authorized codes appear only under Billing, (c) admission date appears only under Identity, (d) goals appear only under Care plan > Goals.
