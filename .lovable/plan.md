# HIVE Training — Build Plan

Training module inside the existing HIVE project. Shared auth + DB, walled off from PHI. Stripe Checkout wired against `STRIPE_SECRET_KEY` (test now, live later, zero code change).

---

## 1. Access model & compliance boundary

- Reuse `auth.users` + `profiles` + `organizations` + `organization_members`. No parallel user table.
- Add `organizations.training_only boolean not null default false`. A training-only org sees only the Training surface; flipping to `false` upgrades to full HIVE — same login, no migration.
- Role mapping onto existing `app_role`:
  - `platform_admin` → existing `super_admin`
  - `company_admin` → existing `admin`
  - `staff` → existing `employee`
  - `state_auditor` → add enum value `auditor`
- **Compliance wall**: every new table prefixed `hive_training_*`. No FKs to `clients`, `client_medications`, `emar_logs`, `incident_reports`, `daily_logs`, PCSP or any PHI table. Enforced by convention + header comment on every migration + code review.

## 2. Database (new tables — all RLS org-scoped via existing `is_org_member` / `is_org_admin_or_manager` helpers)

```text
hive_training_catalog        SKUs sold publicly
  sku, name, kind (full_program|ala_carte), price_cents,
  stripe_price_id, includes text[], sort, active

hive_training_courses        course content
  slug, title, description, cover_url, estimated_minutes,
  cert_validity_months, published

hive_training_course_modules ordered modules per course
  course_id, sort, title, body_md, video_url, quiz_json

hive_training_orders         Stripe Checkout sessions
  organization_id, purchaser_user_id, model (bulk_seats|individual),
  stripe_checkout_session_id, stripe_payment_intent_id,
  amount_cents, currency,
  status (pending|paid|refunded|failed), paid_at

hive_training_order_items    line items
  order_id, catalog_id, quantity, unit_price_cents

hive_training_seats          purchased-but-unassigned entitlement pool
  organization_id, order_id, catalog_id,
  status (available|assigned|consumed),
  assigned_to_user_id, assigned_at

hive_training_assignments    staff <-> course, with payment provenance
  organization_id, user_id, course_id, seat_id nullable,
  payment_model (bulk_seats|individual), order_id nullable,
  status (pending_payment|not_started|in_progress|completed|expired),
  progress_pct, started_at, completed_at, expires_at

hive_training_module_progress
  assignment_id, module_id, completed_at, quiz_score

hive_training_certificates
  assignment_id, code (public verify), issued_at, expires_at, pdf_url
```

RLS: all `organization_id`-scoped. `hive_training_catalog` + `hive_training_courses` get narrow public `TO anon` SELECT (storefront + verify page). `GRANT`s follow the four-step migration rule.

## 3. Payments — Stripe Checkout (test-mode now, live-swappable)

- Server functions read `process.env.STRIPE_SECRET_KEY` inside `.handler()` — no code paths hardcoded to test vs live. Adding the live key later is the only switch.
- Two Checkout flows:
  1. **Bulk seats** (company_admin): line items = N × SKU → on `checkout.session.completed` webhook, insert N `hive_training_seats` rows `status='available'`.
  2. **Individual** (staff): admin creates assignment `status='pending_payment'` → staff hits "Pay & start" → Checkout session with `client_reference_id = assignment_id` → webhook marks assignment paid + `not_started`.
- Webhook: new server route `src/routes/api/public/webhooks/stripe-training.ts` (kept separate from the existing subscription webhook). Verifies signature, idempotent on `stripe_checkout_session_id`, sole writer of `status='paid'`. `STRIPE_WEBHOOK_SECRET_TRAINING` env.
- Hosted Checkout only — never a custom card form. Store only Stripe IDs.

## 4. Public storefront (Surface 1)

- `src/routes/training.tsx` — pricing page mirroring the reference design.
  - Eyebrow "STAFF TRAINING", headline, Full Program card ($300, featured, amber glow) + À la carte card ($75 / $200 / $100 + save-$75 footnote).
  - Navy `#1A2B47`, honey-gold `#C8881E`, generous whitespace, rounded cards. Tokens added to `src/styles.css`; no hardcoded color utilities in components.
  - Real `head()` SEO + og tags.
- `src/routes/training.signup.tsx` — public org + admin signup. Server fn creates org (`training_only=true`), admin membership, sends verify email. No PHI fields.

## 5. Company admin surface (Surface 2)

`src/routes/_authenticated/dashboard.training.tsx` layout + children:
- `.index.tsx` — roster, assignments, completion %, cert expirations, seat balance by SKU.
- `.buy.tsx` — pick SKU + quantity → Checkout (bulk_seats).
- `.assign.tsx` — pick staff + course; if seat available assign from pool, else offer "let staff pay individually".
- `.staff.tsx` — CRUD staff under this org (reuse existing profile pattern, no PHI fields exposed).
- `.orders.tsx` — invoice history from `hive_training_orders`.

Visible when current user is org `admin`. For `training_only` orgs this is the only nav.

## 6. Staff learner surface (Surface 3, mobile-first)

- `dashboard.training.my.tsx` — assigned courses + progress.
- `dashboard.training.course.$assignmentId.tsx` — module player, quiz, completion, certificate.
- `flex-col` → `md:flex-row`, 44px+ tap targets, tables in `overflow-x-auto` (per Core memory).
- `pending_payment` assignments show "Pay $X & start" → individual Checkout.

## 7. Nav integration

- Full-HIVE orgs: add "Training" item to sidebar → same routes.
- Training-only orgs: sidebar collapses to Training + Settings + Billing. Driven by `training_only` + role.

## 8. Certificate verification

Extend existing `certificate.$code.tsx` to resolve training certs too. Public page shows staff first name + course + issue/expiration only — no PII beyond that.

## 9. Build order

1. Migration: enum extension, `training_only` column, all `hive_training_*` tables + RLS + GRANTs.
2. Storefront `/training` + `/training/signup`.
3. Stripe test-mode Checkout server fns + `/api/public/webhooks/stripe-training` handler + secret wiring.
4. Company admin surface (buy → assign → track).
5. Mobile staff learner surface.
6. Nav wiring + `training_only` sidebar mode.
7. Certificate issuance + verify page extension.

## 10. Guardrails / non-goals

- No custom card form ever — hosted Checkout only.
- No FK from any `hive_training_*` table to a PHI table.
- Webhook is the only writer of `status='paid'`.
- No separate auth system, no separate Supabase project.
- v1 course content seeded via migration (I write CPR/Mandt/DSPD copy from what you provide). Full admin authoring UI is a follow-up.
- Refund flow: `charge.refunded` webhook marks order refunded + revokes unconsumed seats. No self-serve refund UI in v1.
- `state_auditor` role gets no training-surface visibility in v1.

## Confirm before I build

1. **Course content for v1**: seed CPR/First Aid, Mandt, and DSPD 30-day + 12-hr ongoing courses from copy you provide, or stub with placeholder modules so the plumbing ships and you fill content in later?
2. **Stripe secrets**: I'll wire against `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET_TRAINING`. Confirm you want me to request those via the secret form now (test values are fine) so the webhook route builds without runtime errors.
3. **Training-only signup**: any minimum required fields beyond org name + admin name/email/password/phone? (e.g. state, agency type)
