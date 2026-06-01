-- Add per-service-code scope to staff assignments. NULL means "all of the
-- client's codes" (back-compat for existing rows); a non-null array means
-- the assignment is limited to exactly those service codes.
ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS service_codes text[];

COMMENT ON COLUMN public.staff_assignments.service_codes IS
  'Service codes this staff member is assigned for this client. NULL = all codes on the client (legacy). Empty array is not allowed semantically — the row should be deleted instead.';

CREATE INDEX IF NOT EXISTS idx_staff_assign_codes
  ON public.staff_assignments USING GIN (service_codes);