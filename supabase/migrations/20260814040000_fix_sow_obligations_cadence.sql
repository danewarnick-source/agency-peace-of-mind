-- Three data corrections to the seeded SOW obligations for True North
-- Supports. Updates existing rows in place (never delete/re-insert) so any
-- instances or completions already generated against these obligation ids
-- stay intact.

-- 1. 30-Day New Hire Orientation Training: clarify this is a one-time
-- initial requirement only — annual renewal is tracked separately under
-- the 12-Hour Annual Continuing Education obligation. cadence is already
-- 'one_time' and correct; only the description needs to say so explicitly.
UPDATE public.company_obligations
SET description = 'All direct-service staff must complete the 23 required orientation training topics from SOW §1.8(4) within 30 days of hire or before working alone with Persons — whichever comes first. This is a one-time initial requirement. Ongoing annual training is tracked separately under the 12-Hour Annual Continuing Education obligation.'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = '30-Day New Hire Orientation Training'
  AND source = 'sow';

-- 2. CPR/First Aid — Initial: SOW §1.8(5) allows 90 days, not 30.
UPDATE public.company_obligations
SET
  due_day_config = '{"days_after_hire": 90}'::jsonb,
  description = 'All direct-service staff must obtain and maintain current CPR and First Aid certification. Initial certification must be obtained within 90 days of hire per SOW §1.8(5). Staff must maintain current certification at all times — renewal is tracked separately.'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'CPR/First Aid Certification — Initial'
  AND source = 'sow';

-- 3. CPR/First Aid — Renewal: track the expiration date printed on the
-- cert itself rather than a hire-anniversary window.
UPDATE public.company_obligations
SET
  due_day_config = '{"every_n_months": 24, "from": "cert_expiration"}'::jsonb,
  description = 'CPR and First Aid certification must remain current at all times. Renewal is due on the expiration date printed on the current certification. When a cert is uploaded and NECTAR reads the expiration date, the next renewal due date is automatically set to that expiration date. If NECTAR cannot extract the expiration date, renewal defaults to 24 months from the upload date.'
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'CPR/First Aid Certification — Renewal'
  AND source = 'sow';
