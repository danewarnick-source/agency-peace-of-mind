
REVOKE EXECUTE ON FUNCTION public.match_timesheets(vector, integer, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_timesheets(vector, integer, timestamptz, timestamptz, integer, uuid) TO authenticated;
