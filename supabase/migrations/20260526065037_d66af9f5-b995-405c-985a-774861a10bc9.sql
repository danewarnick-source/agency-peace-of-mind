CREATE OR REPLACE FUNCTION public.hybrid_search_timesheets(
  query_embedding vector(1536),
  caregiver_name text,
  client_name text,
  hour_min integer,
  date_from timestamptz,
  date_to timestamptz,
  match_count integer,
  _org uuid
)
RETURNS TABLE (id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    t.id,
    CASE
      WHEN query_embedding IS NOT NULL AND t.timesheet_embedding IS NOT NULL
        THEN 1 - (t.timesheet_embedding <=> query_embedding)
      ELSE 1.0
    END AS similarity
  FROM public.evv_timesheets t
  LEFT JOIN public.profiles p ON p.id = t.staff_id
  LEFT JOIN public.clients  c ON c.id = t.client_id
  WHERE t.organization_id = _org
    AND (date_from IS NULL OR t.clock_in_timestamp >= date_from)
    AND (date_to   IS NULL OR t.clock_in_timestamp <= date_to)
    AND (hour_min  IS NULL OR EXTRACT(HOUR FROM t.clock_in_timestamp) >= hour_min)
    AND (
      caregiver_name IS NULL
      OR p.full_name ILIKE '%' || caregiver_name || '%'
      OR p.email     ILIKE '%' || caregiver_name || '%'
    )
    AND (
      client_name IS NULL
      OR c.first_name ILIKE '%' || client_name || '%'
      OR c.last_name  ILIKE '%' || client_name || '%'
      OR (c.first_name || ' ' || c.last_name) ILIKE '%' || client_name || '%'
    )
    AND (query_embedding IS NULL OR t.timesheet_embedding IS NOT NULL)
  ORDER BY
    CASE
      WHEN query_embedding IS NOT NULL
        THEN t.timesheet_embedding <=> query_embedding
      ELSE EXTRACT(EPOCH FROM (now() - t.clock_in_timestamp))
    END
  LIMIT COALESCE(match_count, 50);
$$;

GRANT EXECUTE ON FUNCTION public.hybrid_search_timesheets(
  vector, text, text, integer, timestamptz, timestamptz, integer, uuid
) TO authenticated;