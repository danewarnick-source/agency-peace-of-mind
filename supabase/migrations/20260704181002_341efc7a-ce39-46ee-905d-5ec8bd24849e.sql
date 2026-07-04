-- 1) Rate-limit bookkeeping table
CREATE TABLE public.nectar_rate_state (
  key            text PRIMARY KEY,
  window_start   timestamptz NOT NULL DEFAULT now(),
  window_count   integer     NOT NULL DEFAULT 0,
  day_start      date        NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  day_tokens_used bigint     NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.nectar_rate_state TO service_role;
-- No authenticated/anon grants: only server-side admin helpers touch this.

ALTER TABLE public.nectar_rate_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only"
  ON public.nectar_rate_state
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 2) chunk_attempts on nectar_draft_jobs (per-index attempt counter)
ALTER TABLE public.nectar_draft_jobs
  ADD COLUMN IF NOT EXISTS chunk_attempts jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3) Atomic acquire-slot RPC.
-- Returns wait_ms=0 and increments the window count if a slot was granted,
-- otherwise returns the number of ms the caller should sleep before retrying.
CREATE OR REPLACE FUNCTION public.nectar_check_rate(
  p_key text,
  p_max_per_min integer,
  p_daily_token_cap bigint
) RETURNS TABLE (wait_ms bigint, day_tokens_used bigint, day_full boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      timestamptz := now();
  v_today    date        := (v_now AT TIME ZONE 'UTC')::date;
  v_row      public.nectar_rate_state%ROWTYPE;
  v_elapsed  numeric;
  v_wait     bigint;
BEGIN
  -- Upsert-then-lock. Insert if missing.
  INSERT INTO public.nectar_rate_state(key, window_start, window_count, day_start, day_tokens_used, updated_at)
  VALUES (p_key, v_now, 0, v_today, 0, v_now)
  ON CONFLICT (key) DO NOTHING;

  -- Row-level lock the counter
  SELECT * INTO v_row FROM public.nectar_rate_state WHERE key = p_key FOR UPDATE;

  -- Roll the day counter if UTC date advanced
  IF v_row.day_start <> v_today THEN
    v_row.day_start := v_today;
    v_row.day_tokens_used := 0;
  END IF;

  -- Daily token cap check (only when a cap is provided)
  IF p_daily_token_cap > 0 AND v_row.day_tokens_used >= p_daily_token_cap THEN
    UPDATE public.nectar_rate_state
       SET day_start = v_row.day_start,
           day_tokens_used = v_row.day_tokens_used,
           updated_at = v_now
     WHERE key = p_key;
    wait_ms := 60000;
    day_tokens_used := v_row.day_tokens_used;
    day_full := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (v_now - v_row.window_start));

  -- Roll the window if 60s elapsed
  IF v_elapsed >= 60 THEN
    v_row.window_start := v_now;
    v_row.window_count := 0;
    v_elapsed := 0;
  END IF;

  IF v_row.window_count < p_max_per_min THEN
    -- Grant slot
    UPDATE public.nectar_rate_state
       SET window_start = v_row.window_start,
           window_count = v_row.window_count + 1,
           day_start = v_row.day_start,
           day_tokens_used = v_row.day_tokens_used,
           updated_at = v_now
     WHERE key = p_key;
    wait_ms := 0;
    day_tokens_used := v_row.day_tokens_used;
    day_full := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Window full — return time until next window opens
  v_wait := GREATEST(250, CAST(CEIL((60 - v_elapsed) * 1000) AS bigint));
  UPDATE public.nectar_rate_state
     SET window_start = v_row.window_start,
         window_count = v_row.window_count,
         day_start = v_row.day_start,
         day_tokens_used = v_row.day_tokens_used,
         updated_at = v_now
   WHERE key = p_key;
  wait_ms := v_wait;
  day_tokens_used := v_row.day_tokens_used;
  day_full := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.nectar_check_rate(text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nectar_check_rate(text, integer, bigint) TO service_role;

-- 4) Record tokens consumed by a completed call.
CREATE OR REPLACE FUNCTION public.nectar_record_tokens(
  p_key text,
  p_tokens bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.nectar_rate_state(key, day_start, day_tokens_used, updated_at)
  VALUES (p_key, v_today, GREATEST(0, p_tokens), now())
  ON CONFLICT (key) DO UPDATE
    SET day_tokens_used = CASE
          WHEN public.nectar_rate_state.day_start = v_today
            THEN public.nectar_rate_state.day_tokens_used + GREATEST(0, p_tokens)
          ELSE GREATEST(0, p_tokens)
        END,
        day_start = v_today,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.nectar_record_tokens(text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nectar_record_tokens(text, bigint) TO service_role;

-- 5) Bump-chunk-attempt RPC (atomic per-index increment).
CREATE OR REPLACE FUNCTION public.nectar_bump_chunk_attempt(
  p_job uuid,
  p_index integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key   text := p_index::text;
  v_prior integer;
  v_next  integer;
BEGIN
  SELECT COALESCE((chunk_attempts ->> v_key)::int, 0) INTO v_prior
    FROM public.nectar_draft_jobs
   WHERE id = p_job
   FOR UPDATE;
  v_next := COALESCE(v_prior, 0) + 1;
  UPDATE public.nectar_draft_jobs
     SET chunk_attempts = COALESCE(chunk_attempts, '{}'::jsonb)
                          || jsonb_build_object(v_key, v_next)
   WHERE id = p_job;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.nectar_bump_chunk_attempt(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nectar_bump_chunk_attempt(uuid, integer) TO authenticated, service_role;