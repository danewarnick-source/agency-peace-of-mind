ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_attributes jsonb NOT NULL DEFAULT '{}'::jsonb;
