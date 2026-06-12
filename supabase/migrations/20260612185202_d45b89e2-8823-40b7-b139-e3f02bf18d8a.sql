alter table public.evv_timesheets
  add column if not exists review_status text not null default 'clean',
  add column if not exists attested_accurate boolean not null default false,
  add column if not exists attested_at timestamptz,
  add column if not exists corrected_clock_in timestamptz,
  add column if not exists corrected_clock_out timestamptz,
  add column if not exists edit_reason text,
  add column if not exists edited_by uuid references auth.users(id),
  add column if not exists edited_at timestamptz,
  add column if not exists incident_flag boolean not null default false,
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;