-- Whiteboard placement notes: freeform observations on client/staff pills
-- that inform planning and will be read by NECTAR for fit-scoring later.
-- Full CRUD (working notes, NOT append-only audit trail).

CREATE TABLE public.whiteboard_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('client','staff')),
  subject_id UUID NOT NULL,
  note_text TEXT NOT NULL CHECK (length(btrim(note_text)) > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX whiteboard_notes_subject_idx
  ON public.whiteboard_notes (organization_id, subject_type, subject_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whiteboard_notes TO authenticated;
GRANT ALL ON public.whiteboard_notes TO service_role;

ALTER TABLE public.whiteboard_notes ENABLE ROW LEVEL SECURITY;

-- Org members can read notes for their org
CREATE POLICY "whiteboard_notes_select_org_members"
  ON public.whiteboard_notes FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

-- Admin/manager can insert
CREATE POLICY "whiteboard_notes_insert_admin_manager"
  ON public.whiteboard_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_org_admin_or_manager(organization_id, auth.uid())
    AND created_by = auth.uid()
  );

-- Admin/manager can update any note in their org
CREATE POLICY "whiteboard_notes_update_admin_manager"
  ON public.whiteboard_notes FOR UPDATE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- Admin/manager can delete any note in their org
CREATE POLICY "whiteboard_notes_delete_admin_manager"
  ON public.whiteboard_notes FOR DELETE
  TO authenticated
  USING (public.is_org_admin_or_manager(organization_id, auth.uid()));

-- updated_at trigger (reuses existing helper)
CREATE TRIGGER whiteboard_notes_set_updated_at
  BEFORE UPDATE ON public.whiteboard_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();