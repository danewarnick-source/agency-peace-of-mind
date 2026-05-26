
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

ALTER TABLE public.evv_timesheets
  ADD COLUMN IF NOT EXISTS timesheet_embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_evv_timesheet_embedding
  ON public.evv_timesheets
  USING hnsw (timesheet_embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_timesheets(
  query_embedding vector(1536),
  hour_min integer DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  date_to timestamptz DEFAULT NULL,
  match_count integer DEFAULT 50,
  _org uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    1 - (t.timesheet_embedding <=> query_embedding) AS similarity
  FROM public.evv_timesheets t
  WHERE t.timesheet_embedding IS NOT NULL
    AND (_org IS NULL OR t.organization_id = _org)
    AND (_org IS NULL OR public.is_org_member(_org, auth.uid()))
    AND (date_from IS NULL OR COALESCE(t.rounded_clock_in, t.clock_in_timestamp) >= date_from)
    AND (date_to   IS NULL OR COALESCE(t.rounded_clock_in, t.clock_in_timestamp) <= date_to)
    AND (
      hour_min IS NULL
      OR EXTRACT(HOUR FROM COALESCE(t.rounded_clock_in, t.clock_in_timestamp)) >= hour_min
    )
  ORDER BY t.timesheet_embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 200));
$$;
