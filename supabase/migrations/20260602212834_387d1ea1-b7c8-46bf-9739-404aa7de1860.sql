
-- Approved EVV locations per client (allowlist for variance flagging only — never an EVV capture exemption)
CREATE TABLE public.client_approved_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 60),
  address text,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  geofence_radius_feet integer NOT NULL DEFAULT 500 CHECK (geofence_radius_feet BETWEEN 100 AND 5000),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_approved_locations_client ON public.client_approved_locations(client_id);
CREATE INDEX idx_client_approved_locations_org ON public.client_approved_locations(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_approved_locations TO authenticated;
GRANT ALL ON public.client_approved_locations TO service_role;

ALTER TABLE public.client_approved_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read approved locations"
  ON public.client_approved_locations FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins write approved locations"
  ON public.client_approved_locations FOR ALL TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Enforce max 5 approved locations per client
CREATE OR REPLACE FUNCTION public.enforce_approved_location_cap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.client_approved_locations
    WHERE client_id = NEW.client_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'A client may have at most 5 approved EVV locations.';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cap_approved_locations
  BEFORE INSERT ON public.client_approved_locations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_location_cap();

CREATE TRIGGER trg_touch_approved_locations
  BEFORE UPDATE ON public.client_approved_locations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Append-only audit trail for admin add/edit/remove of approved locations
CREATE TABLE public.client_approved_location_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid NOT NULL,
  location_id uuid,
  action text NOT NULL CHECK (action IN ('add','edit','remove')),
  snapshot jsonb NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calocs_audit_client ON public.client_approved_location_audit(client_id, created_at DESC);

GRANT SELECT, INSERT ON public.client_approved_location_audit TO authenticated;
GRANT ALL ON public.client_approved_location_audit TO service_role;

ALTER TABLE public.client_approved_location_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read approved location audit"
  ON public.client_approved_location_audit FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "admins write approved location audit"
  ON public.client_approved_location_audit FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()) OR public.is_super_admin(auth.uid()));

-- Auto-log changes
CREATE OR REPLACE FUNCTION public.log_approved_location_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.client_approved_location_audit (organization_id, client_id, location_id, action, snapshot, actor_id)
    VALUES (NEW.organization_id, NEW.client_id, NEW.id, 'add', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.client_approved_location_audit (organization_id, client_id, location_id, action, snapshot, actor_id)
    VALUES (NEW.organization_id, NEW.client_id, NEW.id, 'edit', jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.client_approved_location_audit (organization_id, client_id, location_id, action, snapshot, actor_id)
    VALUES (OLD.organization_id, OLD.client_id, OLD.id, 'remove', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_approved_locations
  AFTER INSERT OR UPDATE OR DELETE ON public.client_approved_locations
  FOR EACH ROW EXECUTE FUNCTION public.log_approved_location_change();

-- EVV record now notes which approved location (if any) a punch matched.
-- Capture of actual GPS is unchanged — this is metadata for the audit trail only.
ALTER TABLE public.evv_timesheets
  ADD COLUMN matched_approved_location_id uuid REFERENCES public.client_approved_locations(id) ON DELETE SET NULL,
  ADD COLUMN matched_approved_location_label text;
