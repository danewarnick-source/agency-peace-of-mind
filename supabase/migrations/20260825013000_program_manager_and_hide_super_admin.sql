-- program_manager provider role + stop seeding super_admin into orgs.
-- super_admin remains on the enum for leftover memberships / Hive-internal
-- checks; elevated platform access is is_hive_executive(), not this role.

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'program_manager' AFTER 'manager';
