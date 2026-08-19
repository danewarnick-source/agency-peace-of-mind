-- Database cleanup batch 3: fold staff_training_hours_entries (admin-logged
-- manual training hours) into ce_ledger (the CE record store) as
-- source = 'manual_entry' rows, then drop the old table.
--
-- ce_ledger was built as a self-attestation ledger: staff insert their own
-- rows (ce_ledger_self_insert requires staff_id = auth.uid()), it's
-- immutable (no UPDATE/DELETE policy or grant), and only SELECT/INSERT are
-- granted to authenticated. staff_training_hours_entries is the opposite
-- shape: admins/team-managers log hours ON BEHALF OF staff
-- (auth.uid() <> staff_id) and can edit/delete their own entries.
-- To preserve that behavior after consolidation we add a second,
-- source-scoped INSERT/DELETE policy pair rather than touching the
-- self-attestation policies.

ALTER TABLE public.ce_ledger
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS requirement_id uuid
    REFERENCES public.company_obligations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entry_date date;

INSERT INTO public.ce_ledger (
  staff_id, organization_id, title, hours, active_minutes,
  type, source, ce_year_start, completed_at,
  attestation_text, signature_name, content_hash,
  note, requirement_id, created_by, entry_date
)
SELECT
  staff_id, organization_id,
  COALESCE(note, 'Manually logged training hours'),
  hours, (hours * 60)::integer,
  'manual', 'manual_entry',
  date_trunc('year', entry_date)::date,
  entry_date::timestamptz,
  'Training hours manually recorded by administrator.',
  COALESCE((SELECT full_name FROM profiles WHERE id = created_by), 'Admin'),
  md5(staff_id::text || entry_date::text || hours::text || COALESCE(note, '')),
  note, requirement_id, created_by, entry_date
FROM public.staff_training_hours_entries;

-- Admins/team-managers may log manual entries on behalf of staff (mirrors
-- "sthe write admin or team manager"). Scoped to source = 'manual_entry' so
-- the self-attestation CE flow is untouched.
CREATE POLICY "ce_ledger manual entry insert by admin or team manager"
  ON public.ce_ledger
  FOR INSERT
  TO authenticated
  WITH CHECK (
    source = 'manual_entry'
    AND auth.uid() <> staff_id
    AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

-- Manual entries stay editable/deletable by the logging admin (mirrors
-- "sthe delete admin or team manager"); genuine CE ledger rows
-- (source <> 'manual_entry') remain immutable — no policy covers them.
GRANT DELETE ON public.ce_ledger TO authenticated;
CREATE POLICY "ce_ledger manual entry delete by admin or team manager"
  ON public.ce_ledger
  FOR DELETE
  TO authenticated
  USING (
    source = 'manual_entry'
    AND auth.uid() <> staff_id
    AND public.can_view_staff_pii(organization_id, staff_id, auth.uid())
  );

DROP TABLE IF EXISTS public.staff_training_hours_entries CASCADE;
