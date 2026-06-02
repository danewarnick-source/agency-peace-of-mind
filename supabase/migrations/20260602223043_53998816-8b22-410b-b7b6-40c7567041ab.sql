-- Add state forms section to state_templates.
-- Forms are the state's structured form set (520, 1056, PCSP equivalents)
-- — distinct from required_documents which are recurring docs/attestations.
ALTER TABLE public.state_templates
  ADD COLUMN IF NOT EXISTS forms jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Seed Utah's forms as the reference implementation.
UPDATE public.state_templates
SET forms = jsonb_build_object(
  'forms', jsonb_build_array(
    jsonb_build_object(
      'slug', 'form-520',
      'name', 'Form 520 — Service Delivery Report',
      'cadence', 'monthly',
      'submission', 'DSPD billing portal',
      'produced_by', 'platform'
    ),
    jsonb_build_object(
      'slug', 'form-1056',
      'name', 'Form 1056 — Critical Incident Report',
      'cadence', 'as_needed',
      'submission', 'DSPD incident database (24h deadline)',
      'produced_by', 'platform'
    ),
    jsonb_build_object(
      'slug', 'pcsp',
      'name', 'Person-Centered Support Plan (PCSP)',
      'cadence', 'annual',
      'submission', 'Held in client record; presented at audit',
      'produced_by', 'support_coordinator'
    ),
    jsonb_build_object(
      'slug', 'behavior-support-plan',
      'name', 'Behavior Support Plan',
      'cadence', 'annual',
      'submission', 'Held in client record',
      'produced_by', 'bcba'
    )
  )
)
WHERE state_code = 'UT';
