-- Simplify chore chart: remove the standalone staff-shift chart model.
-- The chore chart is now just: task key + client rotation + every-day items.
-- Staff supporting a client see the rotation for the space in their daily
-- task list, driven by the real scheduler (no second scheduler).
DELETE FROM public.chore_completions WHERE source = 'shift';
DROP TABLE IF EXISTS public.chore_shift_assignments;
DROP TABLE IF EXISTS public.chore_shift_rows;