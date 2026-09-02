-- Live signup is broken: handle_new_user() inserts an org, then
-- seed_rbac_after_org_insert → trg_seed_rbac_on_new_org → seed_system_rbac_roles
-- which writes public.rbac_roles. That table was dropped
-- (20260819203000_drop_verified_dead_tables). The exception handler in
-- live handle_new_user swallows the error, so auth.users is created with
-- no profile, no org, no membership.
--
-- Do not recreate rbac_roles. role_permissions replaced it.
-- This file is also copied into docs/SQL_HANDOFF.md for the human to paste.

DROP TRIGGER IF EXISTS seed_rbac_after_org_insert ON public.organizations;

CREATE OR REPLACE FUNCTION public.trg_seed_rbac_on_new_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.rbac_roles') IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM public.seed_system_rbac_roles(NEW.id);
  RETURN NEW;
END;
$$;
