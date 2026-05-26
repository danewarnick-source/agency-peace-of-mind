-- Performance indexes for AI natural-language search across evv_timesheets
CREATE INDEX IF NOT EXISTS idx_evv_service_type_code ON public.evv_timesheets (service_type_code);
CREATE INDEX IF NOT EXISTS idx_evv_service_type_code_lower ON public.evv_timesheets (lower(service_type_code));
CREATE INDEX IF NOT EXISTS idx_evv_clock_in_timestamp ON public.evv_timesheets (clock_in_timestamp);
CREATE INDEX IF NOT EXISTS idx_evv_raw_clock_in ON public.evv_timesheets (raw_clock_in);
CREATE INDEX IF NOT EXISTS idx_evv_rounded_clock_in ON public.evv_timesheets (rounded_clock_in);
CREATE INDEX IF NOT EXISTS idx_evv_org_status ON public.evv_timesheets (organization_id, status);

-- GIN full-text index across narrative + geofence reason for fallback keyword scans
CREATE INDEX IF NOT EXISTS idx_evv_narrative_fts ON public.evv_timesheets
  USING GIN (
    to_tsvector(
      'english',
      coalesce(shift_note_text, '') || ' ' || coalesce(outside_geofence_reason, '')
    )
  );

-- Caregiver / client name lookups (joined tables)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower ON public.profiles (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_clients_first_name_lower ON public.clients (lower(first_name));
CREATE INDEX IF NOT EXISTS idx_clients_last_name_lower ON public.clients (lower(last_name));