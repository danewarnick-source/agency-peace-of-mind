
CREATE OR REPLACE FUNCTION public.bc_touch_behavior_last_logged()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.bc_behaviors
  SET last_logged_at = NEW.occurred_at
  WHERE id = NEW.behavior_id
    AND (last_logged_at IS NULL OR last_logged_at < NEW.occurred_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bc_touch_last_logged ON public.bc_data_entries;
CREATE TRIGGER trg_bc_touch_last_logged
AFTER INSERT ON public.bc_data_entries
FOR EACH ROW EXECUTE FUNCTION public.bc_touch_behavior_last_logged();
