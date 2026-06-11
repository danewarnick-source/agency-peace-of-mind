alter table public.org_shift_behavior_settings
  add column if not exists rule_settings jsonb not null default '{}'::jsonb,
  add column if not exists ot_threshold_hours numeric not null default 40;

comment on column public.org_shift_behavior_settings.rule_settings is
  'Map<rule_code, "off" | "warn" | "block"> driving the Phase 2 conflict engine.';
comment on column public.org_shift_behavior_settings.ot_threshold_hours is
  'Projected weekly hours above which the overtime policy rule fires.';