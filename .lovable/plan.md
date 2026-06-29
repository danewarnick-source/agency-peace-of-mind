## Goal

Add Playwright e2e coverage that proves the PCSP gate works on the client Care tab for all three PCSP-derived workflows: **Support Strategies**, **Client-Specific Training**, and **Person-Centered Thinking**.

Tests are **read-only against staging** (matching the existing crawler pattern in `e2e/smoke.spec.ts`) and use two seeded clients identified by env vars — no uploads, no writes.

## New env vars (CI secrets + `.env.test`)

- `STAGING_CLIENT_ID_NO_PCSP` — a client in staging with **no** PCSP on file.
- `STAGING_CLIENT_ID_WITH_PCSP` — a client in staging **with** a PCSP on file.

If either is unset, the relevant spec is skipped (`test.skip`) with a clear message so CI doesn't false-fail before the secrets are wired up. Add both to `.github/workflows/e2e.yml` env block alongside the existing `STAGING_CLIENT_ID`.

## New file: `e2e/pcsp-gate.spec.ts`

Each Care-tab card is expanded (they default to collapsed) before assertions, since the gate UI lives inside each collapsible section.

### Spec 1 — No PCSP: actions are gated

For `STAGING_CLIENT_ID_NO_PCSP`, navigate to `/dashboard/clients/{id}` and assert, for each of the three cards:

1. The amber warning banner is visible with the canonical phrase `Upload a PCSP to get started`.
2. The primary action buttons are interactable but **route to the "Upload the PCSP first" dialog** instead of acting. The spec clicks each gated control and asserts:
   - A dialog appears with title `Upload the PCSP first`.
   - The dialog body contains `This client has no PCSP on file`.
   - Dialog is dismissed before the next assertion.

Gated controls covered (one click per card is enough to prove the wiring; the banner assertion covers the rest):
- Support Strategies card: `Build from PCSP goals (NECTAR)` and `Approve & Publish` (when a draft exists) — fall back to whichever is rendered.
- Client-Specific Training card: `Build from PCSP goals (NECTAR)` / `Edit` / `Approve & Publish`.
- Person-Centered Thinking card: `Create profile` / `Review & Publish`.

### Spec 2 — With PCSP: gate is lifted

For `STAGING_CLIENT_ID_WITH_PCSP`, navigate to the same page and assert, for each card:

1. The amber `Upload a PCSP to get started` banner is **not** present.
2. Clicking a primary action does **not** open the `Upload the PCSP first` dialog (assert the dialog with that title is not visible within a short timeout).
3. The PCSP-goals card on the Care tab shows the "PCSP on file" copy (`PCSP on file — pull goals from it`), confirming the gate query returned true.

### Cross-cutting

- Reuse the existing `storageState` auth bootstrap from `e2e/global-setup.ts`; no new login flow.
- Selectors prefer accessible text (`getByRole('button', { name: ... })`, `getByText(/Upload a PCSP to get started/)`, `getByRole('dialog', { name: /Upload the PCSP first/ })`).
- Keep the file self-contained — no shared helpers required beyond what Playwright provides.
- Each spec sets a 30s navigation timeout, uses `waitUntil: "domcontentloaded"`, and tolerates the card-default-collapsed state by clicking the card header first.

## CI wiring

Edit `.github/workflows/e2e.yml` `crawl` job env block to pass through:

```yaml
STAGING_CLIENT_ID_NO_PCSP: ${{ secrets.STAGING_CLIENT_ID_NO_PCSP }}
STAGING_CLIENT_ID_WITH_PCSP: ${{ secrets.STAGING_CLIENT_ID_WITH_PCSP }}
```

No changes to `playwright.config.ts` (the new file lives under the existing `testDir: "./e2e"`).

## Out of scope

- No DB seeding, no PCSP upload, no cleanup logic.
- No assertions on the actual draft/publish server behavior — UI gate only, which is exactly the contract the previous change established.
- No mobile-viewport variants (the card layout is the same; the gate is purely conditional rendering).

## Manual setup the user does once

1. Pick (or create) two staging clients — one with a PCSP document in Files, one without.
2. Add their UUIDs to GitHub Actions secrets as `STAGING_CLIENT_ID_NO_PCSP` and `STAGING_CLIENT_ID_WITH_PCSP`.
3. Re-run the workflow; the two new specs will execute alongside the existing crawler.
