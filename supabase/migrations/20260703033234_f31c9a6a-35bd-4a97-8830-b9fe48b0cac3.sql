ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS requirement_id UUID NULL REFERENCES public.nectar_requirements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS managed_by_requirement BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS forms_requirement_id_idx ON public.forms (requirement_id) WHERE requirement_id IS NOT NULL;