ALTER TABLE public.client_specific_trainings ADD COLUMN IF NOT EXISTS training_type text NOT NULL DEFAULT 'person_specific';
ALTER TABLE public.client_specific_trainings DROP CONSTRAINT IF EXISTS client_specific_trainings_training_type_check;
ALTER TABLE public.client_specific_trainings ADD CONSTRAINT client_specific_trainings_training_type_check CHECK (training_type IN ('person_specific','support_strategies'));
DROP INDEX IF EXISTS public.cst_unique_client;
CREATE UNIQUE INDEX IF NOT EXISTS cst_unique_client_type ON public.client_specific_trainings (client_id, training_type);