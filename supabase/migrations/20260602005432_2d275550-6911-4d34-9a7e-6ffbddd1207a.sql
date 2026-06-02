-- HIVE platform tickets table is missing Data API grants, so service_role
-- inserts (auto-file from NECTAR) and authenticated reads (HIVE exec UI)
-- both silently fail. RLS already restricts both to HIVE executives; this
-- migration just opens the Data API surface so those checks can run.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_platform_tickets TO authenticated;
GRANT ALL ON public.hive_platform_tickets TO service_role;