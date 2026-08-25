-- Replace leftover is_super_admin() RLS/function gates with is_hive_executive().
-- super_admin remains on app_role for history; it is not a product role.
-- Applied on Hive-Platform 2026-08-25.
BEGIN;

ALTER POLICY "Admins or own reimbursement requests" ON "public"."activity_reimbursement_requests"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR (staff_id = auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write agency banks" ON "public"."agency_bank_accounts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read agency banks" ON "public"."agency_bank_accounts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write bank maps" ON "public"."agency_bank_mappings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read bank maps" ON "public"."agency_bank_mappings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Org members can view audit log" ON "public"."billing_submission_audit_log"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Org members can view billing warnings" ON "public"."billing_submission_warnings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Org members can view billing submissions" ON "public"."billing_submissions"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ce_ledger_self_read" ON "public"."ce_ledger"
  USING (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ce_modules_self_read" ON "public"."ce_modules"
  USING (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ce_settings_read" ON "public"."ce_settings"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ce_settings_write" ON "public"."ce_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers insert celebrations" ON "public"."celebration_events"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read celebrations" ON "public"."celebration_events"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write cert types" ON "public"."certification_types"
  USING ((((organization_id IS NOT NULL) AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_hive_executive(auth.uid())))
  WITH CHECK ((((organization_id IS NOT NULL) AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read cert types" ON "public"."certification_types"
  USING ((is_global OR is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read certs" ON "public"."certifications"
  USING (((user_id = auth.uid()) OR is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write approved locations" ON "public"."client_approved_locations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write belongings" ON "public"."client_belongings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read belongings" ON "public"."client_belongings"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Admins read rate history" ON "public"."client_billing_code_rate_history"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Admins write rate history" ON "public"."client_billing_code_rate_history"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Admins read client billing codes" ON "public"."client_billing_codes"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Org admins/managers can write client billing codes" ON "public"."client_billing_codes"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage documents" ON "public"."client_documents"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read documents" ON "public"."client_documents"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write emergency contacts" ON "public"."client_emergency_contacts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read emergency contacts" ON "public"."client_emergency_contacts"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write meds" ON "public"."client_medications"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())))
  WITH CHECK ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read meds" ON "public"."client_medications"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write client_ratios" ON "public"."client_ratios"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read client_ratios" ON "public"."client_ratios"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write weekly targets" ON "public"."client_weekly_targets"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read weekly targets" ON "public"."client_weekly_targets"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write clients" ON "public"."clients"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read clients" ON "public"."clients"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage obligation completions" ON "public"."company_obligation_completions"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read obligation completions" ON "public"."company_obligation_completions"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff insert own obligation completions" ON "public"."company_obligation_completions"
  WITH CHECK (((staff_id = auth.uid()) AND (is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid()))));
ALTER POLICY "admins manage obligation instance assignees" ON "public"."company_obligation_instance_assignees"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read obligation instance assignees" ON "public"."company_obligation_instance_assignees"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage company obligation instances" ON "public"."company_obligation_instances"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read company obligation instances" ON "public"."company_obligation_instances"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage company obligations" ON "public"."company_obligations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read company obligations" ON "public"."company_obligations"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "contractor_pay admins read" ON "public"."contractor_monthly_pay"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "contractor_pay admins write" ON "public"."contractor_monthly_pay"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read cmc" ON "public"."controlled_med_counts"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "super admins read all assignments" ON "public"."course_assignments"
  USING (is_hive_executive(auth.uid()));
ALTER POLICY "managers write cfd" ON "public"."custom_field_definitions"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read cfd" ON "public"."custom_field_definitions"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write cfv" ON "public"."custom_field_values"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read cfv" ON "public"."custom_field_values"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins approve daily logs" ON "public"."daily_logs"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers delete daily logs" ON "public"."daily_logs"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read daily logs" ON "public"."daily_logs"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "users read own daily logs" ON "public"."daily_logs"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read addenda" ON "public"."emar_log_addenda"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admin_reviewed flip only" ON "public"."emar_logs"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read emar" ON "public"."emar_logs"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff update own emar" ON "public"."emar_logs"
  USING (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers delete evv" ON "public"."evv_timesheets"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read timesheets" ON "public"."evv_timesheets"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff read own or managers read all evv" ON "public"."evv_timesheets"
  USING (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff update own active evv" ON "public"."evv_timesheets"
  USING (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK (((staff_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "exec_message_attachments insert" ON "public"."exec_message_attachments"
  WITH CHECK ((is_hive_executive(auth.uid())));
ALTER POLICY "exec_message_attachments select" ON "public"."exec_message_attachments"
  USING ((is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM exec_message_recipients r
  WHERE ((r.message_id = exec_message_attachments.message_id) AND is_org_admin_or_manager(r.organization_id, auth.uid()))))));
ALTER POLICY "exec_message_recipients insert" ON "public"."exec_message_recipients"
  WITH CHECK ((is_hive_executive(auth.uid())));
ALTER POLICY "exec_message_recipients select" ON "public"."exec_message_recipients"
  USING ((is_hive_executive(auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid())));
ALTER POLICY "exec_message_recipients update" ON "public"."exec_message_recipients"
  USING ((is_hive_executive(auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid())))
  WITH CHECK ((is_hive_executive(auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid())));
ALTER POLICY "exec_messages insert" ON "public"."exec_messages"
  WITH CHECK (((is_hive_executive(auth.uid())) AND (sender_user_id = auth.uid())));
ALTER POLICY "exec_messages select" ON "public"."exec_messages"
  USING ((is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM exec_message_recipients r
  WHERE ((r.message_id = exec_messages.id) AND is_org_admin_or_manager(r.organization_id, auth.uid()))))));
ALTER POLICY "user reads own ext certs" ON "public"."external_certifications"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers delete general shifts" ON "public"."general_shifts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff read own or managers read all general shifts" ON "public"."general_shifts"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "staff update own general shift" ON "public"."general_shifts"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs inventory" ON "public"."hhs_client_inventories"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs drills" ON "public"."hhs_evacuation_drills"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "hhs_host_monthly admins read" ON "public"."hhs_host_home_monthly"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "hhs_host_monthly admins write" ON "public"."hhs_host_home_monthly"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "hhs_host_settings admins read" ON "public"."hhs_host_home_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "hhs_host_settings admins write" ON "public"."hhs_host_home_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs incidents" ON "public"."hhs_incident_reports"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs medical" ON "public"."hhs_medical_logs"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs attendance" ON "public"."hhs_monthly_attendance"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs summary" ON "public"."hhs_monthly_summaries"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read hhs transfers" ON "public"."hhs_transfer_logs"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "hive execs manage executives" ON "public"."hive_executives"
  USING ((is_hive_executive(auth.uid())))
  WITH CHECK ((is_hive_executive(auth.uid())));
ALTER POLICY "catalog super admin write" ON "public"."hive_training_catalog"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "modules super admin write" ON "public"."hive_training_course_modules"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "courses super admin write" ON "public"."hive_training_courses"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "admins write home_designations" ON "public"."home_designations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read home_designations" ON "public"."home_designations"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write hsd" ON "public"."home_staff_designations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read hsd" ON "public"."home_staff_designations"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins update incident reports" ON "public"."incident_reports"
  USING (((reported_by = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read incident reports" ON "public"."incident_reports"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write coverage reqs" ON "public"."location_coverage_requirements"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read coverage reqs" ON "public"."location_coverage_requirements"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write locations" ON "public"."locations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read locations" ON "public"."locations"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admin or manager insert med proposals" ON "public"."medication_change_proposals"
  WITH CHECK (((proposed_by = auth.uid()) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (applied_medication_id IS NULL) AND (is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid()))));
ALTER POLICY "admin update med proposals" ON "public"."medication_change_proposals"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())))
  WITH CHECK ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read med proposals" ON "public"."medication_change_proposals"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read transfers" ON "public"."medication_transfers"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage nectar docs" ON "public"."nectar_documents"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read nectar docs" ON "public"."nectar_documents"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage extracted fields" ON "public"."nectar_extracted_fields"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read extracted fields" ON "public"."nectar_extracted_fields"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read approval events" ON "public"."nectar_requirement_approval_events"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins read org notifications" ON "public"."notifications"
  USING ((is_org_member(organization_id, auth.uid()) AND (has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR has_org_role(organization_id, auth.uid(), 'manager'::app_role) OR is_hive_executive(auth.uid()))));
ALTER POLICY "admins update own org notifications" ON "public"."notifications"
  USING ((is_org_member(organization_id, auth.uid()) AND (has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR has_org_role(organization_id, auth.uid(), 'manager'::app_role) OR is_hive_executive(auth.uid()))));
ALTER POLICY "managers update org celeb settings" ON "public"."org_celebration_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write org celeb settings" ON "public"."org_celebration_settings"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read org celeb settings" ON "public"."org_celebration_settings"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "retention managers read" ON "public"."org_referral_retention_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "retention managers write" ON "public"."org_referral_retention_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "Org members can view training orders" ON "public"."org_training_orders"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins delete org members" ON "public"."organization_members"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins insert org members" ON "public"."organization_members"
  WITH CHECK ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins read org members" ON "public"."organization_members"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins update org members" ON "public"."organization_members"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())))
  WITH CHECK ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read org" ON "public"."organizations"
  USING ((is_org_member(id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "super admins and hive execs read all orgs" ON "public"."organizations"
  USING ((is_hive_executive(auth.uid())));
ALTER POLICY "managers write pba accts" ON "public"."pba_accounts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read pba accts" ON "public"."pba_accounts"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write pba audit" ON "public"."pba_audit_samples"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read pba audit" ON "public"."pba_audit_samples"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write pba tx" ON "public"."pba_transactions"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read pba tx" ON "public"."pba_transactions"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "user reads own program assignment" ON "public"."program_assignments"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write program courses" ON "public"."program_courses"
  USING ((EXISTS ( SELECT 1
   FROM training_programs p
  WHERE ((p.id = program_courses.program_id) AND (is_hive_executive(auth.uid()) OR ((p.organization_id IS NOT NULL) AND is_org_admin_or_manager(p.organization_id, auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM training_programs p
  WHERE ((p.id = program_courses.program_id) AND (is_hive_executive(auth.uid()) OR ((p.organization_id IS NOT NULL) AND is_org_admin_or_manager(p.organization_id, auth.uid())))))));
ALTER POLICY "read program courses via program" ON "public"."program_courses"
  USING ((EXISTS ( SELECT 1
   FROM training_programs p
  WHERE ((p.id = program_courses.program_id) AND (p.is_global OR is_org_member(p.organization_id, auth.uid()) OR is_hive_executive(auth.uid()))))));
ALTER POLICY "super admins manage tenants" ON "public"."provider_tenants"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "admins manage org training content" ON "public"."provider_training_modules"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ref-activities managers insert" ON "public"."referral_activities"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "ref-activities managers read" ON "public"."referral_activities"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "referrals managers delete" ON "public"."referrals"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "referrals managers insert" ON "public"."referrals"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "referrals managers read" ON "public"."referrals"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "referrals managers update" ON "public"."referrals"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write role permissions" ON "public"."role_permissions"
  USING ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())))
  WITH CHECK ((has_org_role(organization_id, auth.uid(), 'admin'::app_role) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read role permissions" ON "public"."role_permissions"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins resolve completeness flags" ON "public"."shift_completeness_flags"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write shift_templates" ON "public"."shift_templates"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read shift_templates" ON "public"."shift_templates"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage sjd assessment selections" ON "public"."sjd_assessment_selections"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read sjd assessment selections" ON "public"."sjd_assessment_selections"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write staff assignments" ON "public"."staff_assignments"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read staff assignments" ON "public"."staff_assignments"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage staff group members" ON "public"."staff_group_members"
  USING ((is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM staff_groups g
  WHERE ((g.id = staff_group_members.group_id) AND is_org_admin_or_manager(g.organization_id, auth.uid()))))))
  WITH CHECK ((is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM staff_groups g
  WHERE ((g.id = staff_group_members.group_id) AND is_org_admin_or_manager(g.organization_id, auth.uid()))))));
ALTER POLICY "org members read staff group members" ON "public"."staff_group_members"
  USING ((is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM staff_groups g
  WHERE ((g.id = staff_group_members.group_id) AND is_org_member(g.organization_id, auth.uid()))))));
ALTER POLICY "admins manage staff groups" ON "public"."staff_groups"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read staff groups" ON "public"."staff_groups"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers delete submitted forms" ON "public"."submitted_forms"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers update submitted forms" ON "public"."submitted_forms"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "users read own or managers org submitted forms" ON "public"."submitted_forms"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "sc managers delete" ON "public"."support_coordinators"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "sc managers insert" ON "public"."support_coordinators"
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "sc managers read" ON "public"."support_coordinators"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "sc managers update" ON "public"."support_coordinators"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "super admins manage system_features" ON "public"."system_features"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "super admins manage all teams" ON "public"."teams"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "super admins manage tenant_features" ON "public"."tenant_features"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "managers write time pay categories" ON "public"."time_pay_categories"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read time pay categories" ON "public"."time_pay_categories"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write time pay settings" ON "public"."time_pay_settings"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read time pay settings" ON "public"."time_pay_settings"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "user reads own track assign" ON "public"."track_assignments"
  USING (((user_id = auth.uid()) OR is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "managers write track programs" ON "public"."track_programs"
  USING ((EXISTS ( SELECT 1
   FROM training_tracks t
  WHERE ((t.id = track_programs.track_id) AND (is_hive_executive(auth.uid()) OR ((t.organization_id IS NOT NULL) AND is_org_admin_or_manager(t.organization_id, auth.uid())))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM training_tracks t
  WHERE ((t.id = track_programs.track_id) AND (is_hive_executive(auth.uid()) OR ((t.organization_id IS NOT NULL) AND is_org_admin_or_manager(t.organization_id, auth.uid())))))));
ALTER POLICY "read track programs via track" ON "public"."track_programs"
  USING ((EXISTS ( SELECT 1
   FROM training_tracks t
  WHERE ((t.id = track_programs.track_id) AND (t.is_global OR is_org_member(t.organization_id, auth.uid()) OR is_hive_executive(auth.uid()))))));
ALTER POLICY "members read programs" ON "public"."training_programs"
  USING ((is_global OR is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "super admins write programs" ON "public"."training_programs"
  USING (is_hive_executive(auth.uid()))
  WITH CHECK (is_hive_executive(auth.uid()));
ALTER POLICY "managers write tracks" ON "public"."training_tracks"
  USING ((((organization_id IS NOT NULL) AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_hive_executive(auth.uid())))
  WITH CHECK ((((organization_id IS NOT NULL) AND is_org_admin_or_manager(organization_id, auth.uid())) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read tracks" ON "public"."training_tracks"
  USING ((is_global OR is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins manage upi attestations" ON "public"."upi_attestations"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "org members read upi attestations" ON "public"."upi_attestations"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "admins write week_templates" ON "public"."week_templates"
  USING ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())))
  WITH CHECK ((is_org_admin_or_manager(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "members read week_templates" ON "public"."week_templates"
  USING ((is_org_member(organization_id, auth.uid()) OR is_hive_executive(auth.uid())));
ALTER POLICY "message-attachments download" ON "storage"."objects"
  USING (((bucket_id = 'message-attachments'::text) AND (is_hive_executive(auth.uid()) OR is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid()))));
ALTER POLICY "message-attachments upload" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'message-attachments'::text) AND (is_hive_executive(auth.uid()))));
ALTER POLICY "nectar docs read for org members" ON "storage"."objects"
  USING (((bucket_id = 'nectar-documents'::text) AND (EXISTS ( SELECT 1
   FROM nectar_documents d
  WHERE ((d.storage_path = objects.name) AND (is_org_member(d.organization_id, auth.uid()) OR is_hive_executive(auth.uid())))))));
ALTER POLICY "obligation evidence delete admins" ON "storage"."objects"
  USING (((bucket_id = 'obligation-evidence'::text) AND (is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid()) OR is_hive_executive(auth.uid()))));
ALTER POLICY "obligation evidence insert org members" ON "storage"."objects"
  WITH CHECK (((bucket_id = 'obligation-evidence'::text) AND (is_org_member(((storage.foldername(name))[1])::uuid, auth.uid()) OR is_hive_executive(auth.uid()))));
ALTER POLICY "obligation evidence select org members" ON "storage"."objects"
  USING (((bucket_id = 'obligation-evidence'::text) AND (is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid()) OR is_hive_executive(auth.uid()) OR (owner = auth.uid()))));
ALTER POLICY "obligation evidence update admins" ON "storage"."objects"
  USING (((bucket_id = 'obligation-evidence'::text) AND (is_org_admin_or_manager(((storage.foldername(name))[1])::uuid, auth.uid()) OR is_hive_executive(auth.uid()))));
ALTER POLICY "training assets admin manage" ON "storage"."objects"
  USING (((bucket_id = 'training-assets'::text) AND (is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND om.active AND (om.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))))))
  WITH CHECK (((bucket_id = 'training-assets'::text) AND (is_hive_executive(auth.uid()) OR (EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.user_id = auth.uid()) AND om.active AND (om.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))))))));

-- SQL helpers that called is_super_admin()
CREATE OR REPLACE FUNCTION public.apply_med_change_proposal(_proposal_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.medication_change_proposals%ROWTYPE;
  new_med_id uuid;
  pl jsonb;
BEGIN
  SELECT * INTO p FROM public.medication_change_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  IF NOT (public.has_org_role(p.organization_id, auth.uid(), 'admin')
          OR public.is_hive_executive(auth.uid())) THEN
    RAISE EXCEPTION 'Only an organization admin can approve medication changes';
  END IF;

  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal is not pending (status=%)', p.status;
  END IF;

  pl := COALESCE(p.proposed_payload, '{}'::jsonb);

  IF p.change_type = 'add' THEN
    INSERT INTO public.client_medications (
      organization_id, client_id, medication_name, dosage, frequency, route,
      scheduled_times, instructions, prescriber, purpose, adverse_effects,
      choking_risk, choking_risk_details, is_controlled, is_prn, prn_instructions,
      pharmacy, rx_number, packaging, side_effects,
      contributes_to_swallowing_difficulty, created_by
    ) VALUES (
      p.organization_id, p.client_id,
      COALESCE(pl->>'medication_name',''),
      NULLIF(pl->>'dosage',''), NULLIF(pl->>'frequency',''), NULLIF(pl->>'route',''),
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(pl->'scheduled_times','[]'::jsonb))), '{}'::text[]),
      NULLIF(pl->>'instructions',''), NULLIF(pl->>'prescriber',''),
      NULLIF(pl->>'purpose',''), NULLIF(pl->>'adverse_effects',''),
      COALESCE((pl->>'choking_risk')::boolean, false),
      NULLIF(pl->>'choking_risk_details',''),
      COALESCE((pl->>'is_controlled')::boolean, false),
      COALESCE((pl->>'is_prn')::boolean, false),
      NULLIF(pl->>'prn_instructions',''),
      NULLIF(pl->>'pharmacy',''), NULLIF(pl->>'rx_number',''),
      NULLIF(pl->>'packaging',''), NULLIF(pl->>'side_effects',''),
      COALESCE((pl->>'contributes_to_swallowing_difficulty')::boolean, false),
      auth.uid()
    ) RETURNING id INTO new_med_id;

  ELSIF p.change_type = 'edit' THEN
    IF p.medication_id IS NULL THEN RAISE EXCEPTION 'edit proposal missing medication_id'; END IF;
    UPDATE public.client_medications SET
      medication_name = COALESCE(NULLIF(pl->>'medication_name',''), medication_name),
      dosage = CASE WHEN pl ? 'dosage' THEN NULLIF(pl->>'dosage','') ELSE dosage END,
      frequency = CASE WHEN pl ? 'frequency' THEN NULLIF(pl->>'frequency','') ELSE frequency END,
      route = CASE WHEN pl ? 'route' THEN NULLIF(pl->>'route','') ELSE route END,
      scheduled_times = CASE WHEN pl ? 'scheduled_times'
        THEN COALESCE(ARRAY(SELECT jsonb_array_elements_text(pl->'scheduled_times')), '{}'::text[])
        ELSE scheduled_times END,
      instructions = CASE WHEN pl ? 'instructions' THEN NULLIF(pl->>'instructions','') ELSE instructions END,
      prescriber = CASE WHEN pl ? 'prescriber' THEN NULLIF(pl->>'prescriber','') ELSE prescriber END,
      purpose = CASE WHEN pl ? 'purpose' THEN NULLIF(pl->>'purpose','') ELSE purpose END,
      adverse_effects = CASE WHEN pl ? 'adverse_effects' THEN NULLIF(pl->>'adverse_effects','') ELSE adverse_effects END,
      choking_risk = CASE WHEN pl ? 'choking_risk' THEN (pl->>'choking_risk')::boolean ELSE choking_risk END,
      choking_risk_details = CASE WHEN pl ? 'choking_risk_details' THEN NULLIF(pl->>'choking_risk_details','') ELSE choking_risk_details END,
      is_controlled = CASE WHEN pl ? 'is_controlled' THEN (pl->>'is_controlled')::boolean ELSE is_controlled END,
      is_prn = CASE WHEN pl ? 'is_prn' THEN (pl->>'is_prn')::boolean ELSE is_prn END,
      prn_instructions = CASE WHEN pl ? 'prn_instructions' THEN NULLIF(pl->>'prn_instructions','') ELSE prn_instructions END,
      pharmacy = CASE WHEN pl ? 'pharmacy' THEN NULLIF(pl->>'pharmacy','') ELSE pharmacy END,
      rx_number = CASE WHEN pl ? 'rx_number' THEN NULLIF(pl->>'rx_number','') ELSE rx_number END,
      packaging = CASE WHEN pl ? 'packaging' THEN NULLIF(pl->>'packaging','') ELSE packaging END,
      side_effects = CASE WHEN pl ? 'side_effects' THEN NULLIF(pl->>'side_effects','') ELSE side_effects END,
      contributes_to_swallowing_difficulty = CASE WHEN pl ? 'contributes_to_swallowing_difficulty'
        THEN (pl->>'contributes_to_swallowing_difficulty')::boolean
        ELSE contributes_to_swallowing_difficulty END
    WHERE id = p.medication_id;
    new_med_id := p.medication_id;

  ELSIF p.change_type = 'discontinue' THEN
    IF p.medication_id IS NULL THEN RAISE EXCEPTION 'discontinue proposal missing medication_id'; END IF;
    UPDATE public.client_medications
      SET is_active = false,
          discontinued_at = now(),
          discontinued_by = auth.uid()
    WHERE id = p.medication_id;
    new_med_id := p.medication_id;
  ELSE
    RAISE EXCEPTION 'Unknown change_type: %', p.change_type;
  END IF;

  UPDATE public.medication_change_proposals
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        applied_medication_id = new_med_id
    WHERE id = _proposal_id;

  RETURN new_med_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_pba_audit_sample(_org uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quarter DATE := date_trunc('quarter', CURRENT_DATE)::date;
  v_total INT;
  v_pick INT;
  v_inserted INT := 0;
BEGIN
  IF NOT (is_org_admin_or_manager(_org, auth.uid()) OR is_hive_executive(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COUNT(*) INTO v_total FROM pba_accounts WHERE organization_id = _org;
  v_pick := GREATEST(1, CEIL(v_total * 0.10)::INT);

  WITH picks AS (
    SELECT id FROM pba_accounts
     WHERE organization_id = _org
     ORDER BY random()
     LIMIT v_pick
  )
  INSERT INTO pba_audit_samples (organization_id, quarter, account_id)
  SELECT _org, v_quarter, id FROM picks
  ON CONFLICT (organization_id, quarter, account_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $function$;

CREATE OR REPLACE FUNCTION public.get_rate_as_of(_client_id uuid, _service_code text, _as_of date)
 RETURNS TABLE(rate_per_unit numeric, unit_type text, effective_start date, effective_end date, rate_source text, rate_source_plan_number text, source_kind text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.client_billing_codes
   WHERE client_id = _client_id AND service_code = upper(_service_code)
   LIMIT 1;

  IF v_org IS NULL THEN RETURN; END IF;

  IF NOT (is_org_admin_or_manager(v_org, auth.uid()) OR is_hive_executive(auth.uid())) THEN
    RAISE EXCEPTION 'Not authorized to read rates';
  END IF;

  -- Try current row first
  RETURN QUERY
  SELECT b.rate_per_unit, b.unit_type, b.service_start_date, b.service_end_date,
         b.rate_source, b.rate_source_plan_number, 'current'::text
    FROM public.client_billing_codes b
   WHERE b.client_id = _client_id
     AND b.service_code = upper(_service_code)
     AND (b.service_start_date IS NULL OR b.service_start_date <= _as_of)
     AND (b.service_end_date   IS NULL OR b.service_end_date   >= _as_of)
   LIMIT 1;

  IF FOUND THEN RETURN; END IF;

  -- Fall back to history: most recent superseded row whose window contains the date
  RETURN QUERY
  SELECT h.rate_per_unit, h.unit_type, h.effective_start, h.effective_end,
         h.rate_source, h.rate_source_plan_number, 'history'::text
    FROM public.client_billing_code_rate_history h
   WHERE h.client_id = _client_id
     AND h.service_code = upper(_service_code)
     AND (h.effective_start IS NULL OR h.effective_start <= _as_of)
     AND (h.effective_end   IS NULL OR h.effective_end   >= _as_of)
   ORDER BY h.superseded_at DESC
   LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_referral_pipeline_stats(_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
BEGIN
  -- Caller must be a manager+ of the org (mirror RLS).
  IF NOT (
    public.is_org_admin_or_manager(_organization_id, auth.uid())
    OR public.is_hive_executive(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'by_stage', COALESCE(
      (SELECT jsonb_object_agg(stage, n)
       FROM (
         SELECT stage, count(*)::int AS n
         FROM public.referrals
         WHERE organization_id = _organization_id
           AND status <> 'archived'
         GROUP BY stage
       ) s),
      '{}'::jsonb
    ),
    'placed', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND stage = 'decision' AND decision_outcome = 'placed'
    ),
    'passed', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND stage = 'decision' AND decision_outcome = 'passed'
    ),
    'total', (
      SELECT count(*)::int FROM public.referrals
      WHERE organization_id = _organization_id
        AND status <> 'archived'
    )
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _org_id uuid, _cap text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _member record;
  _role_name text;
  _has_base boolean := false;
  _override text;
BEGIN
  IF _user_id IS NULL OR _org_id IS NULL OR _cap IS NULL OR _cap = '' THEN
    RETURN false;
  END IF;

  -- Explicit deny wins over everything, including super_admin
  SELECT mode INTO _override
  FROM public.user_capability_overrides
  WHERE user_id = _user_id AND organization_id = _org_id AND capability_key = _cap
  LIMIT 1;

  IF _override = 'deny' THEN
    RETURN false;
  END IF;

  -- Super admin bypass (after deny check)
  IF public.is_hive_executive(_user_id) THEN
    RETURN true;
  END IF;

  -- Explicit grant adds even without a matching baseline
  IF _override = 'grant' THEN
    RETURN true;
  END IF;

  -- Baseline from custom_role_id if set, else seeded system role matching app_role
  SELECT om.role::text AS role, om.custom_role_id
    INTO _member
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.organization_id = _org_id
    AND om.active = true
  LIMIT 1;

  IF _member IS NULL THEN
    RETURN false;
  END IF;

  IF _member.custom_role_id IS NOT NULL THEN
    SELECT _cap = ANY(capabilities) INTO _has_base
    FROM public.rbac_roles WHERE id = _member.custom_role_id;
  ELSE
    _role_name := CASE _member.role
      WHEN 'admin'       THEN 'Admin'
      WHEN 'super_admin' THEN 'Admin'
      WHEN 'manager'     THEN 'Manager'
      WHEN 'employee'    THEN 'Employee'
      ELSE NULL
    END;
    IF _role_name IS NOT NULL THEN
      SELECT _cap = ANY(capabilities) INTO _has_base
      FROM public.rbac_roles
      WHERE organization_id = _org_id AND name = _role_name AND is_system = true
      LIMIT 1;
    END IF;
  END IF;

  RETURN COALESCE(_has_base, false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_med_change_proposal(_proposal_id uuid, _notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p public.medication_change_proposals%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.medication_change_proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  IF NOT (public.has_org_role(p.organization_id, auth.uid(), 'admin')
          OR public.is_hive_executive(auth.uid())) THEN
    RAISE EXCEPTION 'Only an organization admin can reject medication changes';
  END IF;

  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'Proposal is not pending (status=%)', p.status;
  END IF;

  UPDATE public.medication_change_proposals
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = _notes
    WHERE id = _proposal_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_company_executive(_membership_id uuid, _grant boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.organization_members WHERE id = _membership_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Membership not found'; END IF;
  IF NOT (
    public.has_org_role(v_org, auth.uid(), 'admin'::app_role)
    OR public.is_hive_executive(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not authorized to manage Company Executive role';
  END IF;
  UPDATE public.organization_members
    SET is_company_executive = _grant
  WHERE id = _membership_id;
END;
$function$;

-- Safety net: leftover RPC/callers still resolve to hive exec.
CREATE OR REPLACE FUNCTION public.is_super_admin(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_hive_executive(_user);
$$;

-- Membership helper: provider leadership only (no leftover super_admin).
CREATE OR REPLACE FUNCTION public.is_org_admin_or_manager(_org uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org
      AND user_id = _user
      AND role IN ('admin','program_manager','manager')
      AND active
  );
$$;

COMMIT;
