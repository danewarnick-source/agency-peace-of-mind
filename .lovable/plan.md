# Company Overview dashboard + NECTAR celebration system

This rebuilds the Company Overview into the spec'd 3-row layout, adds role variations (Company Executive billing card, HIVE Executive cross-company rollup), and ships an event-driven celebration system with server-side de-duplication.

Everything reuses the existing HIVE/NECTAR design system (navy `#141a3d`, amber `#f4a93a`, hexagon motif, Plus Jakarta Sans, `NectarSurface`/`NectarHeader`/`NectarBadge`/`NectarButton`).

---

## 1. Database (one migration)

- `celebration_events` — durable log of fired achievements per scope. Columns: `id`, `organization_id`, `event_key` (e.g. `onboarding.first_completed`, `training.completed`, `compliance.threshold_100`, `streak.30`, `cert.renewed_early`, `onboarding.completed_quickly`), `scope_user_id` (nullable — for per-staff events), `tier` (1|2|3), `payload` jsonb, `created_at`. Unique index on `(organization_id, event_key, coalesce(scope_user_id, '00000000-…'))` so each achievement fires once.
- `celebration_acknowledgements` — per-user dismissals for Tier 2 banners and Tier 3 modals. Columns: `id`, `event_id` (fk), `user_id`, `acknowledged_at`. Unique `(event_id, user_id)`.
- `org_celebration_settings` — `organization_id` pk, `enabled boolean default true`, `tier1_enabled`, `tier2_enabled`, `tier3_enabled`.
- `user_celebration_mute` — `user_id` pk, `muted boolean`.
- GRANTs + RLS scoped to org members; only admins/managers can flip org settings; HIVE-exec gets cross-org read.

## 2. Server functions (`createServerFn`, all auth-middleware-gated)

`src/lib/company-overview.functions.ts` (extend):
- `getCompanyOverviewV2({ organizationId })` returning the new shape:
  - `kpis`: `{ activeStaff, activeStaffDeltaMoM, trainingCompletionPct, complianceCurrentPct, pendingInvites }`
  - `onboardingPipeline`: counts for Invited / In progress / Complete + a short list
  - `expiringSoon`: certs in next 30/60d, soonest first
  - `recentActivity`: last 5 events (completions, hires, role changes)
  - `leaderboard`: top 5 by completion/streak
  - `billing` (only if role can view billing): `{ seatsUsed, seatsPurchased, nextInvoiceAt }` — derived from existing org metadata; null if unknown
  - `isFirstRun`: true when most counts are 0 (drives empty-state nudges)
- `getHiveExecRollup()` — counts + account metadata across orgs for HIVE Execs only. No PHI.

`src/lib/celebrations.functions.ts` (new):
- `listActiveCelebrations({ organizationId })` — returns unacknowledged Tier 2/3 events for this user + recent Tier 1 toasts not yet shown (last 60s window for this user).
- `fireCelebration({ organizationId, eventKey, scopeUserId?, tier, payload })` — idempotent insert (ON CONFLICT DO NOTHING); returns whether it actually fired.
- `acknowledgeCelebration({ eventId })` — records per-user dismissal.
- `evaluateCelebrationTriggers({ organizationId })` — server-side scan that checks domain conditions (first onboarding done, all-training-completed-per-staff, compliance threshold reached, 7/30 day streaks, cert renewed before expiry, fast onboarding) and calls `fireCelebration` for any newly-met conditions. Invoked from a cheap polling endpoint on the dashboard.
- `getCelebrationSettings({ organizationId })` + `setCelebrationSettings(...)` (admin) + `setUserMute({ muted })`.

## 3. UI components

`src/components/company-overview/` (split the monolith for maintainability):
- `kpi-stat-card.tsx` — frosted-glass compact card with delta chip; progress ring variant turns amber below target.
- `onboarding-pipeline-card.tsx` — Invited → In progress → Complete stage list.
- `expiring-soon-card.tsx` — 30/60d certs list with empty state.
- `recent-activity-card.tsx` — 5-row feed, "View all" link.
- `team-leaderboard-card.tsx` — dismissible (state stored in `localStorage`).
- `quick-actions-card.tsx` — Invite staff / Assign module / Create group; primary amber-gradient `NectarButton`, others ghost.
- `billing-plan-card.tsx` — Company Executive only; seats + next invoice (account metadata, no PHI).
- `hive-exec-rollup.tsx` — cross-company counts (HIVE Executive only).
- `first-run-nudge.tsx` — replaces bleak 0% stats on brand-new companies and points at Quick Actions.

`src/components/company-overview.tsx` is rewritten to compose those into 3 rows and to branch on role (`company_executive`, `hive_executive`, default admin). Dashboard prefs and `OVERVIEW_CARDS` are migrated to the new card keys (kept exported so the Settings card still works; old keys are gracefully ignored).

## 4. Celebration system

`src/components/celebrations/celebration-provider.tsx` — top-level provider mounted in `src/routes/dashboard.tsx`:
- Polls `listActiveCelebrations` every 60s and on window focus.
- Tier 1 → amber `sonner` toast with hexagon + check, 4s auto-dismiss. Marks acknowledged immediately.
- Tier 2 → renders `CelebrationBanner` (inline at the top of Company Overview) until dismissed.
- Tier 3 → renders `CelebrationModal` (centered) with restrained confetti/hex-burst.
- Honors `prefers-reduced-motion`: confetti/burst → static hex badge, no animation.
- Honors org `enabled` + per-tier toggles + per-user mute.
- Calls `evaluateCelebrationTriggers` on first load + after key mutations to advance fired-state.

`src/components/celebrations/hex-burst.tsx` — lightweight SVG/canvas hex-burst (CSS keyframes only, ~600ms), reduced-motion fallback included.

## 5. Settings integration

`src/routes/dashboard.settings.tsx`: add a "Celebrations" panel (admin only) with org toggle + per-tier checkboxes. Add a per-user "Mute celebrations" switch (visible to everyone including Staff).

## 6. Role gating

All gating enforced server-side (server fns check role via `requireSupabaseAuth` + RLS):
- Company Staff → never see the overview (existing portal switch already lands them on staff portal).
- Company Admin → full overview minus billing/plan card.
- Company Executive → adds the Billing/Plan card.
- HIVE Executive → cross-company rollup variant.

## Files

**New**
- `supabase/migrations/<ts>_celebrations.sql`
- `src/lib/celebrations.functions.ts`
- `src/components/company-overview/` (8 files above)
- `src/components/celebrations/celebration-provider.tsx`
- `src/components/celebrations/celebration-banner.tsx`
- `src/components/celebrations/celebration-modal.tsx`
- `src/components/celebrations/hex-burst.tsx`
- `src/hooks/use-reduced-motion.tsx`

**Edited**
- `src/lib/company-overview.functions.ts` (add v2 + hive rollup)
- `src/components/company-overview.tsx` (rewrite composition)
- `src/components/company-overview-settings.tsx` (new card keys)
- `src/routes/dashboard.tsx` (mount CelebrationProvider)
- `src/routes/dashboard.settings.tsx` (Celebrations panel)
- `src/integrations/supabase/types.ts` (auto-regenerated by migration)

## Non-goals

- I'm not refactoring the existing `getCompanyOverview` callers; v2 is additive.
- No new icon library / animation library. Confetti is hand-rolled SVG to keep it brand-correct and lightweight.
- HIVE Executive rollup shows account metadata only — no client PHI ever crosses an org boundary.
