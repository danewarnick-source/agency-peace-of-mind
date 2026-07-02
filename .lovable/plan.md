## Goal

Give the admin a single, calm surface that names **which staff member** needs **which training** renewed, with one-click / checkbox-driven "set up renewal" flow. Price stays present but recedes — the headline is compliance and ease, not cost.

## New section on the admin view: "Renewals coming up"

Sits between the readiness banner and the storefront. Replaces today's aggregate "4 staff have CPR expiring…" one-liner with an itemized, staff-level list.

Layout:

```text
Renewals coming up                                    [ Set up renewals ▸ ]
Keep your team current. We'll handle the rest.

☐  Sarah M.       CPR / First Aid       expires Aug 14  (43 days)   [Due soon]
☐  Devon R.       CPR / First Aid       expires Sep 02  (62 days)
☐  Priya K.       Mandt                 expires Sep 20  (80 days)
☐  James O.       DSPD Orientation      expires — never assigned    [Missing]
☐  Full team (12) Full Program refresh                              [Bundle]

    2 selected · Renewal covered end-to-end          [ Set up renewals ]
```

Rules for what shows up:
- Assignments with `expires_at` within the next 120 days (sorted soonest-first).
- Staff on the roster who have **no assignment at all** for a required course → shown as "never assigned" rows so nothing is missed.
- Grouped by staff, but each row is one staff × one course so the checkbox maps cleanly to a seat.
- A "Select all expiring within 60 days" quick-action at the top.

Copy tone: benefit-first, no dollar signs in the row. Small muted price footnote only ("Covered by 1 seat each") appears under the sticky action bar, not on every row.

## The "Set up renewals" flow

Clicking the primary button opens a single confirmation sheet:

1. **Summary** — "Renew 4 trainings for 3 staff. Certificates auto-issued on completion, expirations tracked."
2. **Bundle suggestion** — if the selection maps to a Full Program cheaper than à-la-carte, we quietly swap and show a single line: "Bundled as Full Program — saves $75 and covers everything." No hard sell.
3. **Price line** — one line, small, at the bottom: `Total: $X · one-time`.
4. Primary button: **Set up renewals** → existing bulk-seats Stripe checkout with the correct catalog SKU(s) preloaded. On webhook success, seats auto-assign back to the exact staff+course pairs that were checked (this is the ease-of-use payoff).

Auto-assign on success is the important half: today the admin buys seats then has to hand-assign each one. The renewal flow records the intent (which staff × which course each seat is for) before checkout, and the webhook handler consumes those intents into `hive_training_assignments` automatically.

## Readiness banner — trimmed

The existing yellow banner keeps its evergreen fallback, but the aggregate "4 staff have CPR expiring… Cover them — $75/staff" line moves out. That aggregate CTA now scrolls the admin to the new **Renewals coming up** table instead of scrolling to the storefront. Rationale: the storefront is for adding programs; renewals are their own quieter surface.

## Storefront — softened

Small copy adjustments to match the ease/compliance framing:
- Featured card keeps the "Best value · save $75" ribbon (it's factual, not a hard sell).
- À-la-carte prices stay in the corner badge but the card body leads with what it satisfies, not the number.
- No dollar figures in row-level renewal UI.

## Technical section

Files:
- `src/routes/dashboard.hive-training.index.tsx` — add `RenewalsSection` between `ReadinessBanner` and `Storefront`. Move current expiring-cert logic out of the banner and into the new section.
- `src/routes/dashboard.hive-training.index.tsx` — new `SetupRenewalsDialog` component (selection summary + bundle suggestion + checkout trigger).
- `supabase/functions/create-training-checkout/index.ts` — accept an optional `renewal_intents: [{ user_id, course_id, catalog_id }]` array; persist to a new `hive_training_renewal_intents` row keyed by the Stripe session id.
- `supabase/functions/training-stripe-webhook/index.ts` — on `checkout.session.completed`, if renewal intents exist, consume each freshly-created seat by inserting the matching `hive_training_assignments` row and marking the seat `consumed` — bypassing manual assignment.

Database (single new table, PHI-free, stays within the `hive_training_*` boundary):

```sql
CREATE TABLE public.hive_training_renewal_intents (
  id uuid PK,
  organization_id uuid,
  stripe_session_id text,
  catalog_id uuid,
  user_id uuid,          -- staff to auto-assign to
  course_id uuid,        -- specific course this seat should fulfill
  consumed_at timestamptz,
  created_at timestamptz
);
-- GRANTs to authenticated (admin RLS: is_org_admin_or_manager) + service_role.
-- No FKs into PHI tables. Same compliance wall as the rest of hive_training_*.
```

Data queries the admin view needs (all against existing tables, no new schema for reads):
- `hive_training_assignments` where `organization_id = org` and `expires_at <= now + 120 days`, joined to `hive_training_courses`.
- `organization_members` × `org_member_directory` for the roster.
- Cross-reference to surface "never assigned" rows: staff with no assignment for each required course.
- `hive_training_catalog` (already loaded) to resolve which SKU covers each course, and to detect Full-Program bundling.

Selection state lives in local React state (a `Map<userId+courseId, catalogId>`), passed into the dialog and then into `create-training-checkout`.

Out of scope for this pass:
- No email reminders yet (surface only).
- No changes to the staff view.
- No new roles/enum changes.
