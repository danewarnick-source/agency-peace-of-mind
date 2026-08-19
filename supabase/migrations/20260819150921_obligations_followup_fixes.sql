-- Company Obligations follow-up fixes (patch prompt, 2026-08-19)
-- Fix 1: notifications.urgency check constraint drift.
-- Fix 2: CPR Renewal cadence correction.
-- Fix 7: regenerate CPR Initial instances with corrected 90-day due config.
-- Fix 8: grace period for days_after_hire:0 obligations on existing staff.
-- Fix 9: verify/correct Annual 12-Hour + Background Screening due_day_config.
-- Fix 13: regenerate service-code-specific staff obligation instances with
--         the corrected assignee filter.

-- ── Fix 1 — notifications urgency check constraint ─────────────────────────
-- Two prior migrations left conflicting CHECK constraints; the live one only
-- allows ('normal','urgent','critical') but obligation code (and other
-- existing notification call sites) send 'high' and 'low'.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_urgency_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_urgency_check
  CHECK (urgency IN ('low', 'normal', 'high', 'urgent', 'critical'));

-- ── Fix 2 — CPR Renewal / Background Screening cadence ─────────────────────
UPDATE public.company_obligations
SET cadence = 'annually'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'CPR/First Aid Certification — Renewal'
  AND due_day_config->>'every_n_months' IS NOT NULL
  AND cadence <> 'annually';

-- ── Fix 7 — regenerate CPR Initial instances (corrected 90-day config) ─────
DELETE FROM public.company_obligation_instances
WHERE obligation_id = (
  SELECT id FROM public.company_obligations
  WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
    AND title = 'CPR/First Aid Certification — Initial'
);

-- ── Fix 8 — grace period for days_after_hire:0 obligations ─────────────────
-- Existing instances were generated before the grace-period logic shipped;
-- delete so they regenerate with the 30-day grace period applied.
DELETE FROM public.company_obligation_instances i
USING public.company_obligations o
WHERE i.obligation_id = o.id
  AND o.organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND o.due_day_config->>'days_after_hire' = '0';

-- ── Fix 9 — verify/correct Annual 12-Hour + Background Screening configs ───
UPDATE public.company_obligations
SET due_day_config = '{"anniversary_based": true, "start_year": 2}'::jsonb
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'Annual 12-Hour Continuing Education'
  AND (due_day_config->>'anniversary_based' IS NULL OR due_day_config->>'start_year' IS NULL);

UPDATE public.company_obligations
SET due_day_config = '{"anniversary_based": true}'::jsonb
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'Background Screening — Annual'
  AND due_day_config->>'anniversary_based' IS NULL;

DELETE FROM public.company_obligation_instances i
USING public.company_obligations o
WHERE i.obligation_id = o.id
  AND o.organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND o.title IN ('Annual 12-Hour Continuing Education', 'Background Screening — Annual');

-- ── Fix 13 — regenerate service-code-specific staff obligation instances ───
-- (ACRE and other SEI/SED/SJD/SEE/HSQ/PPS/CMP/CMS-targeted staff obligations
-- were generating for every group member instead of only staff actively
-- assigned to a matching-service-code client.)
DELETE FROM public.company_obligation_instances i
USING public.company_obligations o
WHERE i.obligation_id = o.id
  AND o.organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND o.target_service_codes && ARRAY['SEI', 'SED', 'SJD', 'SEE', 'HSQ', 'PPS', 'CMP', 'CMS']
  AND o.scope = 'staff';
