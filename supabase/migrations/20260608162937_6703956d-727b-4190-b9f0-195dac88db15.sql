ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_intake_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_intake_status_check CHECK (intake_status IN ('pending','in_progress','awaiting_admin_signoff','complete'));