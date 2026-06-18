## Goal

Every clickable thing on the admin home (KPI cards, "Needs you today", "Setup & backlog", billing tiles) lands on the precise page/tab/filter where the work gets done, and NECTAR shows a short, focused guidance banner on that page explaining how to resolve it. Today most clicks dump into `/dashboard/hub/documentation?tab=records` or a generic staff page with no context.

## Scope (only touch these surfaces)

- `src/components/company-overview.tsx` — fix every `to` / `search` on KPI cards and queue items.
- `src/components/billing/...` billing snapshot tiles (claims-ready, payroll gross) — point at the specific billing/timeclock view.
- Destination routes — add a `?focus=<key>&from=brief` search param and render a new NECTAR guidance banner. No business-logic changes; filter logic only where a route already supports it.
- New shared component `src/components/nectar/nectar-focus-banner.tsx` plus a focus-key registry.

Out of scope: schema changes, server functions, NECTAR AI calls, the onboarding panel (already shipped).

## Focus-key map (home click → destination → guidance)

| Card / item | New destination | Guidance topic |
|---|---|---|
| KPI · Audit readiness | `/dashboard/hub/documentation?tab=audit&focus=audit-readiness` | What "ready" means + how to clear gaps |
| KPI · EVV match | `/dashboard/timeclock?focus=evv-out-of-bounds` (filter to out-of-geofence punches) | Resolve out-of-geofence reasons |
| KPI · Documentation | `/dashboard/hub/documentation?tab=records&focus=doc-gaps` | What a "doc gap" is and how to close it |
| KPI · Credentials current | `/dashboard/certifications?focus=expiring` | Renew vs. document waivers |
| KPI · Overall compliance | `/dashboard/compliance-desk?focus=overview` | How the overall score is computed |
| Published shifts not yet accepted | `/dashboard/scheduler?focus=unaccepted` | Nudge staff / reassign / cancel |
| Certifications expiring within 30 days | `/dashboard/certifications?focus=expiring-30` | Specific 30-day renewal workflow |
| Incident reports pending review | `/dashboard/hub/documentation?tab=incidents&focus=pending-review` | Review → SC request → close |
| Daily logs returned for revision | `/dashboard/daily-logs?status=returned&focus=returned` | Read denial reason, fix, resubmit |
| Notes awaiting signature (7d) | `/dashboard/hub/documentation?tab=records&focus=unsigned-notes` | Bulk sign / coach staff |
| Authoritative requirements needing review | `/dashboard/authoritative-sources?focus=req-review` | Approve / edit / archive |
| Requirement mappings flagged | `/dashboard/authoritative-sources?focus=mapping-gaps` | Map to engine fields |
| Claims ready to submit | `/dashboard/billing?focus=claims-ready` | Pre-submit scrub steps |
| Payroll this period (gross) | `/dashboard/timeclock?focus=payroll-review` | Pay-period review checklist |

Where a route doesn't yet `validateSearch` for `focus`, add a permissive `z.object({ focus: z.string().optional(), … }).passthrough()` so the link doesn't 404 / strip. No tab structure changes.

## NectarFocusBanner

New component, mirrors the existing `OnboardingGuidanceBanner` look-and-feel (NECTAR header + amber surface, dismissible per-session via `useUiDismissal`).

```text
src/components/nectar/nectar-focus-banner.tsx
src/components/nectar/nectar-focus-content.ts   // registry: key → {title, why, steps[]}
```

- Reads `focus` from the current route's search params.
- Looks up content from the registry — if no match, renders nothing.
- Renders: NECTAR mark, headline ("Let's clear these out-of-geofence punches"), 1-sentence why, numbered 2–4-step playbook, and a single CTA button anchored to the relevant in-page control (e.g. "Filter to out-of-geofence" pre-applies the filter on the page).
- Pure presentation — never fabricates beyond the static registry copy. Matches the project rule that NECTAR is advisory and never invents content.

## Filter wiring (minimal, only where the page already supports it)

- `/dashboard/timeclock` — when `focus=evv-out-of-bounds`, pre-set the existing exception filter to "Out of geofence".
- `/dashboard/timeclock` — when `focus=payroll-review`, pre-set the period to current pay period.
- `/dashboard/daily-logs` — when `status=returned`, pre-select the existing status filter.
- `/dashboard/certifications` — when `focus=expiring-30`, pre-set the existing days-until-expiry filter to 30.
- `/dashboard/scheduler` — when `focus=unaccepted`, scroll to the "Unaccepted" section (already rendered) and highlight it.
- All other focus values are display-only (banner renders; no filter changes).

If a page's filter API isn't already in place, the banner still renders with manual steps — no new filter UI is invented.

## Acceptance

1. Clicking each KPI card from `/dashboard` lands on the exact tab/filter listed above, not a generic hub.
2. The NECTAR guidance banner appears at the top of every destination when `?focus=…` is present and disappears after dismissal or when the user navigates away.
3. The "Incident reports pending review" link opens the Incidents tab (not Records) and the banner explains the SC-request / closure path.
4. Removing `?focus=` from the URL renders the page exactly as it does today (no regressions).
5. No backend, schema, or AI changes; no edits to onboarding flow, no edits to unrelated routes.

## Files

- Edit: `src/components/company-overview.tsx` (KPI specs + queue items + billing tiles `to`/`search`)
- Edit: `src/routes/dashboard.timeclock.tsx`, `dashboard.daily-logs.tsx`, `dashboard.certifications.tsx`, `dashboard.scheduler.tsx`, `dashboard.compliance-desk.tsx`, `dashboard.authoritative-sources.tsx`, `dashboard.billing.tsx`, `dashboard.hub.documentation.tsx` — add `focus` to `validateSearch`, mount `<NectarFocusBanner />` at top, pre-apply filter where supported.
- New: `src/components/nectar/nectar-focus-banner.tsx`, `src/components/nectar/nectar-focus-content.ts`.