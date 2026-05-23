-- Convert clients.job_code from text to text[]
ALTER TABLE public.clients
  ALTER COLUMN job_code DROP DEFAULT,
  ALTER COLUMN job_code TYPE text[] USING
    CASE
      WHEN job_code IS NULL OR job_code = '' THEN ARRAY[]::text[]
      ELSE string_to_array(job_code, ',')
    END,
  ALTER COLUMN job_code SET DEFAULT ARRAY[]::text[];

UPDATE public.clients SET job_code = ARRAY[]::text[] WHERE job_code IS NULL;
ALTER TABLE public.clients ALTER COLUMN job_code SET NOT NULL;

-- Add shifts.job_code for the specific code chosen at clock-in
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS job_code text;