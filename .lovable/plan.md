# Settings page: two focused consolidations

Scope: `src/routes/dashboard.settings.tsx` and the two service-code routes. Nothing else on the Settings page changes.

## 1. "Profile & organization" combined section (top of page)

Replace the three separate cards (Profile form, Organization form, Account contact form) with a single card at the top of the settings grid titled **Profile & organization**, containing three clearly labeled sub-sections stacked vertically inside one bordered container:

- **Your profile** — email (disabled) + full name + Save profile button. Same fields/handler as today.
- **Organization details** — org name, legal name, DBA, display acronym, DHHS Provider ID, EVV vendor name, Nectar incident-review toggle + Save organization button. Admin-only, same fields/handler as today.
- **Billing contact** — main contact / email / mobile phone + Save button (renamed from "Account contact" so its purpose is obvious). Admin/manager/super_admin only, same server fns (`getAccountContact` / `updateAccountContact`) and same "used for urgent billing SMS only" helper text.

Each sub-section keeps its own form + Save button (so saves stay scoped and permissions still gate correctly). Card spans both grid columns (`lg:col-span-2`) so the three stacked sub-sections read cleanly. Sub-headings use a smaller heading style with a thin divider between them.

`CompanyOverviewSettings`, `CelebrationSettings`, and `ShiftBehaviorToggleCard` stay exactly where they are — unchanged, as the user asked.

## 2. Unified "Service codes" entry

Today there are two separate link cards:
- Service Code Registry → `/dashboard/settings/service-codes` (read-only reference)
- Service Catalog → `/dashboard/settings/service-catalog` (editable config)

Change:
- Replace both cards on the Settings page with **one** card titled **Service codes**, description: "Read-only reference for every code (EVV, rates, caps, cadence) and the editable scheduling/billing configuration the scheduler and billing engine read from." Links to `/dashboard/settings/service-codes`. Visible when admin OR manager OR super_admin (registry's broader audience wins; the config tab itself will remain admin-gated inside — see below).
- Convert `dashboard.settings.service-codes.tsx` into a tabbed shell with two views:
  - **Reference** (default) — the existing `ServiceCodeRegistryPage` body, unchanged. Visible to admin/manager/super_admin.
  - **Configuration** — renders the existing service-catalog page body. Visible to admin/super_admin only; if a manager lands on `?view=config`, they see a small "Admin-only" notice and the tab is disabled.
- Tab state uses the URL (`?view=reference|config`, default `reference`) so links/bookmarks stay stable.
- Extract the catalog page's component from `dashboard.settings.service-catalog.tsx` into a shared component (or import the route's component function) so both the standalone route and the new tab render identical UI. Keep `/dashboard/settings/service-catalog` working as a thin redirect to `/dashboard/settings/service-codes?view=config` so any existing links/bookmarks don't break.

## Files touched

- `src/routes/dashboard.settings.tsx` — rebuild top of grid into single "Profile & organization" card with three sub-sections; replace the two service-code link cards with one unified card. All other cards untouched.
- `src/routes/dashboard.settings.service-codes.tsx` — wrap current page in tabbed shell (Reference / Configuration), URL-driven `?view=`.
- `src/routes/dashboard.settings.service-catalog.tsx` — extract page body to a reusable component imported by the tab; route itself becomes a redirect to `?view=config`.

## Out of scope (explicitly untouched per user)

Team access, Institutional Client Banking Registry, Automation Rules, HIVE Subscription, Email Sender, Referral retention, Gmail referral ingestion, Company Overview, Celebrations, Shift behavior toggle.
