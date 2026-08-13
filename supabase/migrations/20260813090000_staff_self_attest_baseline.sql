-- Allow a staffer to write their own baseline-training completion row, but
-- ONLY for the fixed set of self-attestable baseline keys (currently just
-- the SEI Benefits Knowledge Attestation). Every other baseline key keeps
-- the existing "staff_id <> auth.uid()" admin/manager-only write policy.
CREATE POLICY "baseline self attestation write"
  ON public.staff_baseline_training_completions
  FOR ALL
  TO authenticated
  USING (staff_id = auth.uid() AND training_key IN ('sei_benefits_attestation'))
  WITH CHECK (staff_id = auth.uid() AND training_key IN ('sei_benefits_attestation'));

-- Same carve-out for the attestation log: a staffer may insert their own
-- attestation row when it targets a self-attestable baseline training key.
CREATE POLICY "doc_attest_insert_self_attest_baseline"
  ON public.document_attestations
  FOR INSERT
  WITH CHECK (
    staff_id = auth.uid()
    AND subject_kind = 'baseline_cert'
    AND subject_ref IN ('sei_benefits_attestation')
    AND attested_by = auth.uid()
  );
