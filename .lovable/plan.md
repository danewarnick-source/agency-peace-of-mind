## Problem
Deleting an archived client fails with `function public.is_org_admin_or_manager(uuid) does not exist`. The dialog also can't load record counts ("Unable to load record counts").

## Root cause
`client_deletion_impact(_client_id)` and `delete_client_hard(_client_id)` call `public.is_org_admin_or_manager(c.organization_id)` with one argument, but the live helper's signature is `is_org_admin_or_manager(_org uuid, _user uuid)` — two args. Postgres reports the missing overload and the RPC aborts.

## Fix
One migration that recreates both functions (and `discard_import_job_hard` if it has the same call) so the authorization check passes both args:

```sql
IF NOT public.is_org_admin_or_manager(c.organization_id, auth.uid()) THEN
  RAISE EXCEPTION 'Not authorized';
END IF;
```

No client-side changes. After this, the impact counts render and Delete permanently succeeds.
