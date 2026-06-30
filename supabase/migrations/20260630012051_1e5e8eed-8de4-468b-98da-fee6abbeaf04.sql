ALTER TABLE public.assignment_map
  ADD COLUMN IF NOT EXISTS service_codes text[];

COMMENT ON COLUMN public.assignment_map.service_codes IS
  'Optional per-code scope for the proposed staff↔client caseload row. NULL = all of the client''s authorized codes (default). Applied to staff_assignments.service_codes at commit.';