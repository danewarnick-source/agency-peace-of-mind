-- Add missing foreign keys so PostgREST can resolve embedded relationships
ALTER TABLE public.shifts
  ADD CONSTRAINT shifts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT shifts_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.shift_notes
  ADD CONSTRAINT shift_notes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON public.shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_organization_id ON public.shifts(organization_id);
CREATE INDEX IF NOT EXISTS idx_shift_notes_user_id ON public.shift_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_organization_id ON public.clients(organization_id);