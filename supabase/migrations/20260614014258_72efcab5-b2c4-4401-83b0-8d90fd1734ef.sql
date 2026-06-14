
ALTER TABLE public.client_progress_summaries
  ADD COLUMN IF NOT EXISTS summary_kind text NOT NULL DEFAULT 'narrative',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS draft_content text,
  ADD COLUMN IF NOT EXISTS final_content text,
  ADD COLUMN IF NOT EXISTS draft_source jsonb,
  ADD COLUMN IF NOT EXISTS drafted_at timestamptz,
  ADD COLUMN IF NOT EXISTS drafted_by uuid,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by uuid,
  ADD COLUMN IF NOT EXISTS finalized_by_name text,
  ADD COLUMN IF NOT EXISTS include_goal_progress boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cps_summary_kind_check') THEN
    ALTER TABLE public.client_progress_summaries
      ADD CONSTRAINT cps_summary_kind_check CHECK (summary_kind IN ('narrative','financial_statement'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cps_status_check') THEN
    ALTER TABLE public.client_progress_summaries
      ADD CONSTRAINT cps_status_check CHECK (status IN ('pending','draft','in_review','finalized','no_source'));
  END IF;
END $$;
