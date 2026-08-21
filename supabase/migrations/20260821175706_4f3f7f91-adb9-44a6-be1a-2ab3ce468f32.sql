ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_urgency_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_urgency_check
  CHECK (urgency IN ('low', 'normal', 'high', 'urgent', 'critical'));