
-- 1. Schema: course ↔ catalog wiring
ALTER TABLE public.hive_training_courses
  ADD COLUMN IF NOT EXISTS catalog_id uuid REFERENCES public.hive_training_catalog(id) ON DELETE SET NULL;

ALTER TABLE public.hive_training_catalog
  ADD COLUMN IF NOT EXISTS fulfills_course_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- 2. Seed the three real courses (idempotent by slug)
INSERT INTO public.hive_training_courses (slug, title, description, estimated_minutes, cert_validity_months, published, catalog_id)
SELECT 'cpr_first_aid',
       'CPR & First Aid',
       'American Heart Association-aligned CPR and First Aid for direct support professionals.',
       120, 24, true,
       (SELECT id FROM public.hive_training_catalog WHERE sku = 'cpr_first_aid')
WHERE NOT EXISTS (SELECT 1 FROM public.hive_training_courses WHERE slug = 'cpr_first_aid');

INSERT INTO public.hive_training_courses (slug, title, description, estimated_minutes, cert_validity_months, published, catalog_id)
SELECT 'mandt',
       'Mandt Behavioral Intervention',
       'Relational, physical, and technical Mandt System training for de-escalation and safe intervention.',
       360, 12, true,
       (SELECT id FROM public.hive_training_catalog WHERE sku = 'mandt')
WHERE NOT EXISTS (SELECT 1 FROM public.hive_training_courses WHERE slug = 'mandt');

INSERT INTO public.hive_training_courses (slug, title, description, estimated_minutes, cert_validity_months, published, catalog_id)
SELECT 'dspd_required',
       'DSPD Required Training',
       'Utah DSPD-required 30-day onboarding and 12-hour ongoing curriculum for direct support staff.',
       720, 12, true,
       (SELECT id FROM public.hive_training_catalog WHERE sku = 'dspd_required')
WHERE NOT EXISTS (SELECT 1 FROM public.hive_training_courses WHERE slug = 'dspd_required');

-- 3. Seed one starter module per course (idempotent by course_id + sort)
INSERT INTO public.hive_training_course_modules (course_id, sort, title, body_md)
SELECT c.id, 1, 'Course Overview',
       '# Welcome\n\nThis is the first module. Course content is being finalized — competency check will unlock as modules are added.'
FROM public.hive_training_courses c
WHERE c.slug IN ('cpr_first_aid','mandt','dspd_required')
  AND NOT EXISTS (
    SELECT 1 FROM public.hive_training_course_modules m
    WHERE m.course_id = c.id AND m.sort = 1
  );

-- 4. Point the Full Program bundle at the three courses it fulfills
UPDATE public.hive_training_catalog
   SET fulfills_course_ids = ARRAY(
     SELECT id FROM public.hive_training_courses
     WHERE slug IN ('cpr_first_aid','mandt','dspd_required')
   )
 WHERE sku = 'full_program';

-- 5. Helper: is a seat still available to assign?
CREATE OR REPLACE FUNCTION public.hive_training_seat_available(_seat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hive_training_seats s
    WHERE s.id = _seat_id
      AND s.status = 'available'
      AND s.assigned_to_user_id IS NULL
  );
$$;
