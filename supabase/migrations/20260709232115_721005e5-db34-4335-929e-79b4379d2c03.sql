-- Add a lock column so the auto-enable rule never overrides an admin's explicit choice.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS self_admin_med_support_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.self_admin_med_support_locked IS
  'When true, an admin has explicitly set self_admin_med_support and the auto-enable-on-medication trigger must leave it alone.';

-- Trigger: any time a medication row is inserted for a client, turn on
-- self-administration support automatically, UNLESS an admin has taken
-- ownership of the flag. Never turns the flag OFF.
CREATE OR REPLACE FUNCTION public.autoenable_self_admin_on_med()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clients
     SET self_admin_med_support = true
   WHERE id = NEW.client_id
     AND self_admin_med_support = false
     AND self_admin_med_support_locked = false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autoenable_self_admin_on_med ON public.client_medications;
CREATE TRIGGER trg_autoenable_self_admin_on_med
AFTER INSERT ON public.client_medications
FOR EACH ROW
EXECUTE FUNCTION public.autoenable_self_admin_on_med();

-- Retroactive backfill: every client that already has any medication on file
-- but hasn't been explicitly overridden by an admin gets self-admin turned on.
UPDATE public.clients c
   SET self_admin_med_support = true
 WHERE c.self_admin_med_support = false
   AND c.self_admin_med_support_locked = false
   AND EXISTS (SELECT 1 FROM public.client_medications m WHERE m.client_id = c.id);