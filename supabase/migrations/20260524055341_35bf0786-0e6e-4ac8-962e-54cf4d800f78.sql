
ALTER FUNCTION public.enforce_belongings_discard_sig() SET search_path = public;
ALTER FUNCTION public.enforce_els_caps() SET search_path = public;
ALTER FUNCTION public.enforce_respite_caps() SET search_path = public;
ALTER FUNCTION public.enforce_pba_receipt() SET search_path = public;
ALTER FUNCTION public.recalc_pba_balance() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.generate_pba_audit_sample(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_pba_audit_sample(UUID) TO authenticated;
