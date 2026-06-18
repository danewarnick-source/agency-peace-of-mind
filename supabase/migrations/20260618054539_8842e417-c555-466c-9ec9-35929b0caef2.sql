
ALTER TYPE public.sub_plan ADD VALUE IF NOT EXISTS 'hive_standard';
ALTER TYPE public.sub_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE public.sub_status ADD VALUE IF NOT EXISTS 'cancelled';
