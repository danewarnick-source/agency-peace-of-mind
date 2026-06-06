
-- Seed renewal metadata on HR staff checklist requirements.
-- Idempotent: only sets keys when they are missing, so editors can override.

DO $$
DECLARE
  r RECORD;
  patterns jsonb := jsonb_build_array(
    jsonb_build_object('pat', '%cpr certif%',                                       'm', 24, 'src', 'practice'),
    jsonb_build_object('pat', '%first aid certif%',                                 'm', 24, 'src', 'practice'),
    jsonb_build_object('pat', '%behavior intervention certif%',                     'm', 12, 'src', 'practice'),
    jsonb_build_object('pat', '%bci background check%',                             'm', 24, 'src', 'practice'),
    jsonb_build_object('pat', '%oig medicaid fraud%',                               'm',  1, 'src', 'practice'),
    jsonb_build_object('pat', '%annual 12 hours%',                                  'm', 12, 'src', 'sow'),
    jsonb_build_object('pat', '12-month performance evaluation',                    'm', 12, 'src', 'sow'),
    jsonb_build_object('pat', '%hhs certification%',                                'm', 12, 'src', 'practice'),
    jsonb_build_object('pat', '%foster home permit%',                               'm', 12, 'src', 'practice'),
    jsonb_build_object('pat', 'DACS application',                                   'm', 12, 'src', 'practice'),
    jsonb_build_object('pat', '%medicaid disclosure%',                              'm', 36, 'src', 'practice')
  );
  p jsonb;
BEGIN
  -- Mark renewable items
  FOR p IN SELECT * FROM jsonb_array_elements(patterns) LOOP
    UPDATE public.nectar_requirements
       SET metadata = metadata
         || jsonb_build_object(
              'is_renewable', true,
              'renewal_interval_months', (p->>'m')::int,
              'renewal_source', p->>'src'
            )
     WHERE metadata->>'scope' = 'hr_staff_checklist'
       AND title ILIKE (p->>'pat')
       AND (metadata->>'is_renewable') IS NULL;
  END LOOP;

  -- Everything else in HR scope without a setting defaults to one-time
  UPDATE public.nectar_requirements
     SET metadata = metadata || jsonb_build_object('is_renewable', false)
   WHERE metadata->>'scope' = 'hr_staff_checklist'
     AND (metadata->>'is_renewable') IS NULL;
END $$;
