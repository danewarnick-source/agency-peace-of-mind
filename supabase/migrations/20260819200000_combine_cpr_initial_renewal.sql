-- Fix 14: Combine CPR Initial + Renewal into one continuous obligation.
-- Staff get certified within 90 days of hire, then renew every 2 years from
-- the expiration date printed on their cert — that's one requirement, not
-- two separate obligations.

-- Step 1 — delete the Renewal obligation and its instances.
DELETE FROM public.company_obligation_instances
WHERE obligation_id = (
  SELECT id FROM public.company_obligations
  WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
    AND title = 'CPR/First Aid Certification — Renewal'
);

DELETE FROM public.company_obligations
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'CPR/First Aid Certification — Renewal';

-- Step 2 — turn the Initial obligation into the single unified CPR obligation.
UPDATE public.company_obligations
SET
  title = 'CPR & First Aid Certification',
  description = 'All direct-service staff must obtain and maintain a current CPR and First Aid certification. Initial certification required within 90 days of hire per SOW §1.8(5). Certification must stay current at all times — when a certificate is uploaded and NECTAR reads the expiration date, the next renewal instance is automatically scheduled from that date. If NECTAR cannot read the expiration date, renewal defaults to 24 months from the upload date.',
  cadence = 'annually',
  due_day_config = '{"days_after_hire": 90, "every_n_months": 24, "from": "cert_expiration"}'::jsonb,
  reminder_days_before = ARRAY[60, 30, 14, 7]
WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
  AND title = 'CPR/First Aid Certification — Initial';

-- Step 3 — delete existing CPR instances so they regenerate with the
-- corrected 90-day due date under the new unified title.
DELETE FROM public.company_obligation_instances
WHERE obligation_id = (
  SELECT id FROM public.company_obligations
  WHERE organization_id = '7fabcf5d-f826-487f-8730-8b0c3f1969bb'
    AND title IN ('CPR/First Aid Certification — Initial', 'CPR & First Aid Certification')
);
