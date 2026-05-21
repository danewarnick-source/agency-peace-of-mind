
-- Extend lessons to support multiple content types
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_type TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS required BOOLEAN NOT NULL DEFAULT true;

-- Valid lesson types
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_type_check;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_type_check CHECK (
  lesson_type IN ('text','video','pdf','callout','accordion','quiz','scenario','acknowledgement','knowledge_check')
);

-- Quiz attempts (separate from generic lesson_progress so we track score/retries)
CREATE TABLE IF NOT EXISTS public.lesson_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT false,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_quiz_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user own attempts" ON public.lesson_quiz_attempts;
CREATE POLICY "user own attempts" ON public.lesson_quiz_attempts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "managers read attempts" ON public.lesson_quiz_attempts;
CREATE POLICY "managers read attempts" ON public.lesson_quiz_attempts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.lessons l
      JOIN public.course_modules m ON m.id = l.module_id
      JOIN public.courses c ON c.id = m.course_id
      WHERE l.id = lesson_quiz_attempts.lesson_id
        AND is_org_admin_or_manager(c.organization_id, auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS lesson_quiz_attempts_user_lesson_idx
  ON public.lesson_quiz_attempts (user_id, lesson_id, created_at DESC);

-- Public bucket for training assets (PDFs, videos, cover images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-assets', 'training-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read training assets" ON storage.objects;
CREATE POLICY "public read training assets" ON storage.objects
  FOR SELECT USING (bucket_id = 'training-assets');

DROP POLICY IF EXISTS "managers upload training assets" ON storage.objects;
CREATE POLICY "managers upload training assets" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'training-assets' AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "managers update training assets" ON storage.objects;
CREATE POLICY "managers update training assets" ON storage.objects
  FOR UPDATE USING (bucket_id = 'training-assets' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "managers delete training assets" ON storage.objects;
CREATE POLICY "managers delete training assets" ON storage.objects
  FOR DELETE USING (bucket_id = 'training-assets' AND auth.uid() IS NOT NULL);
