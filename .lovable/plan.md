## Why you're still seeing the old layout

The Profile tab itself is already wired to the new `ClientProfileTab` component. What's making the page *look* old is leftover chrome rendered **above** the tabs on `/dashboard/clients/<id>`:

- `ClientReadinessCard` (line 124)
- `FinishOnboardingCard` (line 125)

Those two big cards belong to the smart-import "done" flow — per the rebuild contract they should not appear on the client profile page. They sit above every tab, so the Profile tab opens to the old readiness/onboarding banner instead of the new clean profile.

There is also a now-dead `OverviewPanel` function (lines 209–375) still sitting in the route file. It isn't rendered, but it keeps imports alive and creates confusion when reading the file.

## Changes

**File: `src/routes/dashboard.clients.$clientId.tsx`**

1. Remove the two render lines:
   ```
   <ClientReadinessCard clientId={clientId} />
   <FinishOnboardingCard clientId={clientId} />
   ```
2. Remove their imports.
3. Delete the unused `OverviewPanel` function and any imports it was the sole user of (e.g. `Phone`, `Stethoscope` icons, `Field`, `QuickLink`, `TrackedFieldsCard`, `AdminHoursCard` — only if not used elsewhere in the file).

Everything else stays as-is. The Profile tab continues to render `ClientProfileTab` (the new component).

## Verification

- Open `/dashboard/clients/<any client>` → Profile tab.
- Expect: header (name + badges) directly above the tabs, then the new profile cards (completeness bar, identity, contacts, at-a-glance, retention). No readiness card, no "Finish onboarding" card.
- Other tabs (Plan & goals, Billing codes, etc.) unchanged.
- `npm run build` passes; `routeTree.gen.ts` regenerated if needed.

## Out of scope

- The `/dashboard/workspace/<id>` "About" tab (staff portal) is a different component and was never part of the profile rebuild. Tell me if you also want that swapped.
