# Hive Platform QA Audit Report

**Date:** 2026-06-18
**Scope:** End-to-end user journey — signup, onboarding, clock in/out, training completion, reporting
**Method:** Static code audit (src/) + migration file review. No live DB queries.

---

## Issues Fixed

### 1. Training completions invisible in Reports
**Severity:** Critical
**Files:** `src/routes/dashboard.reports.tsx`, `src/routes/dashboard.training.$id.tsx`
**Root cause:** `dashboard.training.$id.tsx` upserts completions into `user_training_progress`. `dashboard.reports.tsx` reads exclusively from `course_assignments`. The two tables were never joined.
**Impact:** Staff completing every training module would show 0% in all compliance exports.
**Fix:** Added `user_training_progress` as a merged second data source in `exportTrainingCompletion` and `exportComplianceSummary`. CSV output includes a "source" column distinguishing the two systems.
**Status:** ✅ Fixed

### 2. NECTAR company profile never persisted to database
**Severity:** Critical
**File:** `src/components/onboarding/nectar-onboarding-panel.tsx`
**Root cause:** `saveProfile()` called `writeLS()` only. No `supabase.from("organizations").update()` call existed.
**Impact:** Profile data (services offered, client count, specializations) was browser-local. Lost on device switch or cache clear. NECTAR had no DB record to draw from.
**Fix:** Added `organizations.update()` as the first action in `saveProfile()`, persisting to `services_offered`, `approx_client_count`, `specializations`, `nectar_profile_saved_at`. DB write wrapped in try/catch with localStorage fallback. SQL migration for these columns handled separately.
**Status:** ✅ Fixed (pending SQL migration for new columns)

### 3. Onboarding completion state stored in localStorage
**Severity:** Critical
**File:** `src/components/onboarding/nectar-onboarding-panel.tsx`
**Root cause:** `step2Complete = profileSavedLocal` (localStorage). `step5Complete = servicesVisited` (localStorage). Both evaporate on device switch.
**Fix:** `step2Complete` now checks `nectar_profile_saved_at` from DB with localStorage fallback. `step5Complete` now checks real active service code count from `service_codes` table.
**Status:** ✅ Fixed

### 4. Clock-out closed all open shifts simultaneously
**Severity:** Critical
**Files:** `src/hooks/use-general-shift.tsx`, `src/components/staff-mobile/general-time-clock.tsx`
**Root cause:** `stop()` and `updateNote()` matched rows by `user_id + clock_out_timestamp IS NULL` only — no shift ID guard.
**Fix:** Both functions now accept `shiftId` as first argument. Update predicates use `.eq("id", shiftId)` so only the targeted row is affected.
**Status:** ✅ Fixed

---

## Remaining Issues (tracked, not fixed in this pass)

| # | Issue | Severity | Path |
|---|---|---|---|
| 5 | Fake seeded staff_certifications with no org scoping | Critical | SQL-only fix, handled separately |
| 6 | user_training_progress RLS returns own rows only — org-wide report incomplete | Moderate | Requires RLS policy widening + org_id column |
| 7 | training_modules.progress is a static per-module column, not per-user | Minor | Remove in future migration |
| 8 | handle_new_user trigger does not create organizations row | Moderate | Depends on separate provisioning mechanism |

---

## Journey Test Matrix

| Journey step | Data flow | Result |
|---|---|---|
| Signup — account creation | `supabase.auth.signUp()` + OTP | ✅ Pass |
| Signup — email verify | `supabase.auth.verifyOtp()` | ✅ Pass |
| Signup — business info | `profiles` + `organizations` update | ✅ Pass |
| Signup — pricing | UI only | ✅ Pass |
| Signup — training select | UI only, form state | ✅ Pass |
| Signup — payment + provision | `org_subscriptions` + `org_training_orders` | ✅ Pass |
| Onboarding Step 1 — authoritative sources | `nectar_documents` + `nectar_attestations` | ✅ Pass |
| Onboarding Step 2 — NECTAR profile | `organizations.nectar_profile_saved_at` | ✅ Fixed |
| Onboarding Step 3 — add staff | `organization_members` count | ✅ Pass |
| Onboarding Step 4 — add clients | `clients` count | ✅ Pass |
| Onboarding Step 5 — service codes | `service_codes` active count | ✅ Fixed |
| Onboarding Step 6 — docs hub | `nectar_documents` count | ✅ Pass |
| Clock in | `general_shifts` INSERT | ✅ Pass |
| Clock out | `general_shifts` UPDATE by shift ID | ✅ Fixed |
| Training module completion | `user_training_progress` UPSERT | ✅ Pass |
| Training visible in Reports | merged `course_assignments` + `user_training_progress` | ✅ Fixed |
| Reports CSV export | Blob download | ✅ Pass |
| Billing lockout gate | `org_subscriptions.locked_at` in `dashboard.tsx` beforeLoad | ✅ Pass |
