
-- 1. Lessons table
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES public.course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lessons_module ON public.lessons(module_id, order_index);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read lessons via course"
ON public.lessons FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.course_modules m
  JOIN public.courses c ON c.id = m.course_id
  WHERE m.id = lessons.module_id
    AND (c.is_global OR public.is_org_member(c.organization_id, auth.uid()))
));

CREATE POLICY "managers write lessons"
ON public.lessons FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.course_modules m
  JOIN public.courses c ON c.id = m.course_id
  WHERE m.id = lessons.module_id
    AND public.is_org_admin_or_manager(c.organization_id, auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.course_modules m
  JOIN public.courses c ON c.id = m.course_id
  WHERE m.id = lessons.module_id
    AND public.is_org_admin_or_manager(c.organization_id, auth.uid())
));

-- 2. Lesson progress table
CREATE TABLE public.lesson_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assignment_id UUID REFERENCES public.course_assignments(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT true,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);
CREATE INDEX idx_lesson_progress_user ON public.lesson_progress(user_id);
CREATE INDEX idx_lesson_progress_assignment ON public.lesson_progress(assignment_id);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user reads own lesson progress"
ON public.lesson_progress FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.course_assignments a
    WHERE a.id = lesson_progress.assignment_id
      AND public.is_org_admin_or_manager(a.organization_id, auth.uid())
  )
);

CREATE POLICY "user writes own lesson progress"
ON public.lesson_progress FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 3. Recalc trigger: auto-create assignment if missing, update progress %, complete when all lessons done
CREATE OR REPLACE FUNCTION public.recalc_assignment_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id UUID;
  v_org_id UUID;
  v_assignment_id UUID;
  v_total INT;
  v_done INT;
  v_pct INT;
  v_status assignment_status;
BEGIN
  SELECT c.id, c.organization_id INTO v_course_id, v_org_id
  FROM public.lessons l
  JOIN public.course_modules m ON m.id = l.module_id
  JOIN public.courses c ON c.id = m.course_id
  WHERE l.id = NEW.lesson_id;

  IF v_course_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find or create an assignment for this user+course
  SELECT id INTO v_assignment_id
  FROM public.course_assignments
  WHERE course_id = v_course_id AND user_id = NEW.user_id
  LIMIT 1;

  IF v_assignment_id IS NULL THEN
    INSERT INTO public.course_assignments (course_id, user_id, organization_id, assigned_by, status)
    VALUES (v_course_id, NEW.user_id, COALESCE(v_org_id, (SELECT organization_id FROM public.organization_members WHERE user_id = NEW.user_id AND active LIMIT 1)), NEW.user_id, 'in_progress')
    RETURNING id INTO v_assignment_id;
  END IF;

  -- Stamp assignment on the progress row
  IF NEW.assignment_id IS DISTINCT FROM v_assignment_id THEN
    UPDATE public.lesson_progress SET assignment_id = v_assignment_id WHERE id = NEW.id;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.lessons l
  JOIN public.course_modules m ON m.id = l.module_id
  WHERE m.course_id = v_course_id;

  SELECT COUNT(*) INTO v_done
  FROM public.lesson_progress lp
  JOIN public.lessons l ON l.id = lp.lesson_id
  JOIN public.course_modules m ON m.id = l.module_id
  WHERE m.course_id = v_course_id
    AND lp.user_id = NEW.user_id
    AND lp.completed;

  v_pct := CASE WHEN v_total > 0 THEN ROUND((v_done::numeric / v_total) * 100) ELSE 0 END;
  v_status := CASE WHEN v_pct >= 100 THEN 'completed'::assignment_status
                   WHEN v_pct > 0   THEN 'in_progress'::assignment_status
                   ELSE 'not_started'::assignment_status END;

  UPDATE public.course_assignments
  SET progress = v_pct,
      status = v_status,
      completed_at = CASE WHEN v_status = 'completed' THEN now() ELSE NULL END
  WHERE id = v_assignment_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_assignment_progress
AFTER INSERT OR UPDATE ON public.lesson_progress
FOR EACH ROW EXECUTE FUNCTION public.recalc_assignment_progress();
