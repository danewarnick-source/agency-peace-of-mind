# Replace remaining old eMAR UI

The new flow (server function, training gate, audit trail, addenda) is already wired. What's left is a UI-string sweep on the workspace MAR tab plus deleting two orphan files so the old design can't reappear.

## What you'll see change on `/workspace/...?tab=emar`

- **Today's Pass row badges**
  - `Administered 8:00 AM` → `Self-administered 8:00 AM`
  - `Five Rights Signed` → `Self-admin attested`
  - Legend dot label `Administered` → `Self-administered`
- **Today's Pass row button**
  - `Record Pass` → `Observe & Confirm`
  - `Update Status` → `Add update`
  - `Document Now` (overdue) → keep, but reframe tooltip to "Document the self-admin window"
  - `Log PRN` → keep (PRN is fine wording)
- **MAR Sheet (calendar) detail popover**
  - `Five Rights attested` → `Self-admin attested`
  - Legend `Administered` swatch → `Self-administered`
- **Header strip**
  - "X administered" count chip → "X self-administered"

No behavior, schema, or server-function changes — labels only on `src/components/workspace/mar-emar-tab.tsx`.

## Dead-code removal (so the old UI can't drift back)

- Delete `src/components/workspace/emar-tab.tsx` — the old "Pass Med / Sun-Sunset-Moon" component. Confirmed zero imports project-wide.
- Delete the inline `function EmarTab(...)` (and its `saveEmarLog` import if it becomes unused) inside `src/routes/dashboard.hhs-hub.$clientId.tsx` — it's defined but the tab actually renders `MarEmarTab`. Confirmed not called from any TabsContent.

## Out of scope

- Visual redesign — only the strings above change. If you want a different *look* (different layout, colors, density), say so and I'll do that as a separate pass with previews.
- The `/dashboard/emar` standalone route — already using the new "Observe & Confirm" flow from last turn; not touching it.
- `MedicationsManager` on the Clients page — that's the med list/editor, not the pass UI.

## Technical notes

- File touched for relabels: `src/components/workspace/mar-emar-tab.tsx` (lines around 1112, 1202, 1560, 1627–1635, 1690–1696).
- Files deleted: `src/components/workspace/emar-tab.tsx`; inline `EmarTab` block at `src/routes/dashboard.hhs-hub.$clientId.tsx:544` plus any now-orphan imports (`saveEmarLog`, dialog state) it leaves behind.
- Verification: `bunx tsc --noEmit` to confirm no orphan references remain after the deletions.
