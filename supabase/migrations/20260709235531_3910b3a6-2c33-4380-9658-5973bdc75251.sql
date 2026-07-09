-- Backfill: mirror any legacy clients.pcsp_goals (text[]) into the structured
-- client_specific_trainings.goals jsonb store as {id, goal, supports:'', details:'', job_codes:[]}.
-- Runs only for clients that don't already have non-empty structured goals.
-- Idempotent: safe to re-run.

WITH src AS (
  SELECT
    c.id                                  AS client_id,
    c.organization_id                     AS organization_id,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'id',        'g_' || replace(gen_random_uuid()::text, '-', ''),
        'goal',      g,
        'supports',  '',
        'details',   '',
        'job_codes', '[]'::jsonb
      ))
      FROM unnest(c.pcsp_goals) AS g
      WHERE g IS NOT NULL AND btrim(g) <> ''
    ) AS goals_json
  FROM public.clients c
  WHERE c.pcsp_goals IS NOT NULL
    AND array_length(c.pcsp_goals, 1) > 0
),
existing AS (
  SELECT src.client_id, src.organization_id, src.goals_json, cst.id AS training_id, cst.goals AS current_goals
  FROM src
  LEFT JOIN public.client_specific_trainings cst
    ON cst.client_id = src.client_id AND cst.training_type = 'person_specific'
),
-- Update rows that exist but have empty/null goals.
upd AS (
  UPDATE public.client_specific_trainings cst
     SET goals = e.goals_json,
         updated_at = now()
    FROM existing e
   WHERE cst.id = e.training_id
     AND e.training_id IS NOT NULL
     AND jsonb_array_length(COALESCE(e.current_goals, '[]'::jsonb)) = 0
     AND e.goals_json IS NOT NULL
  RETURNING cst.id
),
-- Insert draft rows for clients with no CST person_specific row at all.
ins AS (
  INSERT INTO public.client_specific_trainings
    (organization_id, client_id, training_type, title, content, goals, status, version)
  SELECT
    e.organization_id, e.client_id, 'person_specific', 'Client-Specific Training',
    '{"sections":[]}'::jsonb, e.goals_json, 'draft', 1
  FROM existing e
  WHERE e.training_id IS NULL AND e.goals_json IS NOT NULL
  RETURNING id
)
SELECT
  (SELECT count(*) FROM upd)  AS updated_rows,
  (SELECT count(*) FROM ins)  AS inserted_rows;