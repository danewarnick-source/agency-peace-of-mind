## Goal
On `/dashboard/smart-import/{jobId}/review`, remove the always-visible `AssignmentMapPanel` rendered below the wizard, and fold staff assignment into the wizard's "Staff & training" step so the new step-rail UI is the only surface.

## Changes (single file: `src/routes/dashboard.smart-import.$jobId.review.tsx`)

1. **Delete the bottom panel render** in `ReviewInner` (around line 108): remove the `<AssignmentMapPanel ... />` sitting below `<SubjectReview />`.

2. **Pass assignment-map data into the wizard.** `AssignmentMapPanel` currently needs `jobId`, `subjects`, and `assignments` from the parent job query. Plumb these down:
   - `ReviewInner` → `SubjectReview` (add `jobId`, `subjects`, `assignments` props)
   - `SubjectReview` → `SubjectWizard` (same three props)

3. **Render `AssignmentMapPanel` inside the wizard's `step === "staff"` branch for client jobs.** Replace the current placeholder card with:
   - Short helper text ("Assign staff and scope each one to the codes they're authorized for. Per-client training unlocks after PCSP upload.")
   - `<AssignmentMapPanel jobId subjects assignments onChanged={onChanged} />`
   - Employee mode keeps the existing `CertsPanel`.

4. **No server-fn changes, no schema changes, no behavior changes** to `AssignmentMapPanel` itself — it's just relocated.

## Out of scope
- Smart-Import index/upload page styling.
- Any change to PlacementLineup, BillingCodesEditor, CertsPanel, QuestionsPanel, UnfiledPanel, ProvisioningPanel internals.
- Any change to server functions.

## Verification
- Build passes (regenerates `routeTree.gen.ts` if needed).
- On the review page, the bottom assignment table is gone; clicking the "Staff & training" step in the rail shows the assignment map for client jobs and the certs panel for employee jobs.