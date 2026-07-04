CREATE TABLE public.hive_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  body text NOT NULL,
  related_feature_key text NULL,
  related_route text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hive_knowledge TO authenticated;
GRANT ALL ON public.hive_knowledge TO service_role;

ALTER TABLE public.hive_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Executives can read hive knowledge"
  ON public.hive_knowledge FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active));

CREATE POLICY "Executives can manage hive knowledge"
  ON public.hive_knowledge FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active))
  WITH CHECK (EXISTS (SELECT 1 FROM public.hive_executives he WHERE he.user_id = auth.uid() AND he.active));

CREATE INDEX hive_knowledge_fts_idx
  ON public.hive_knowledge
  USING gin (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || coalesce(category,'')));

CREATE INDEX hive_knowledge_category_idx ON public.hive_knowledge (category);
CREATE INDEX hive_knowledge_feature_idx ON public.hive_knowledge (related_feature_key);

CREATE TRIGGER trg_hive_knowledge_updated
  BEFORE UPDATE ON public.hive_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.hive_knowledge (title, slug, category, body, related_feature_key, related_route) VALUES
('Executive Command Center overview', 'command-center-overview', 'Master Controller',
'The Executive Command Center is the platform-operations console for HIVE. It lives at /dashboard/hive-exec/command. From here execs monitor MRR, active companies, and a "Needs you" queue of pending approvals and upgrade requests. The left sidebar groups every exec surface into four domains: Growth & Accounts, Compliance & Approvals, Configuration, and Operations & Support. The Command Center never displays client PHI — it is scoped to account, billing, and platform-configuration data only.',
 null, '/dashboard/hive-exec/command'),

('Add a feature to the Feature Registry', 'add-feature-registry', 'Feature Registry',
'Go to Configuration → Feature Registry (/dashboard/hive-exec/features). Click "New feature", then fill in: feature_key (lowercase.dotted, e.g. billing.bulk_export), Label, Description, Category (tab / subtab / nectar_feature), optional Parent Key, Default Enabled, Sort Order, Required Tier, and Upgrade Blurb. Save. The new feature becomes available immediately for org toggling in the Master Controller without a database migration.',
 'features.manage', '/dashboard/hive-exec/features'),

('Toggle a feature on for an organization', 'toggle-org-feature', 'Master Controller',
'Open Growth & Accounts → Companies, click the organization, then open the org detail page. In the Feature Toggles section, flip the switch for the feature you want to enable. Toggles read from feature_registry and write to organization_features. Turning a feature off is immediate and hides the corresponding tab / subtab / NECTAR capability for that org''s users on their next navigation.',
 'features.manage', '/dashboard/hive-exec'),

('Provision an auditor account', 'provision-auditor', 'State Audit',
'From an organization detail page, open the Audit Packages section. Create or select a package, then use "Share with auditor" to mint an auditor share (auditor_shares row). The auditor receives a token-linked, read-only URL scoped to the specific package_items. Shares expire on the configured date, and every open is logged in auditor_share_access_log. Auditors never see other orgs, other packages, or PHI outside the shared items.',
 null, '/dashboard/hive-exec'),

('Grant or deny an Upgrade Request', 'grant-upgrade-request', 'Upgrade Requests',
'Go to Growth & Accounts → Upgrade Requests (/dashboard/hive-exec/upgrade-requests). Pending requests appear with the org, requested feature, and justification. Click Approve to flip the corresponding organization_features row on and notify the org admin, or Deny with an optional reason. Approvals are audited in hive_executive_audit_log.',
 'upgrades.manage', '/dashboard/hive-exec/upgrade-requests'),

('Approve or reject an Extraction submission', 'extraction-approval', 'Extraction Approvals',
'Open Compliance & Approvals → Extraction Approvals. Each row shows the org, the source document, and NECTAR''s proposed extracted fields with confidence. Click into a row to review the diff against existing data. Approve to commit the extracted fields to the org; Reject with a note so the org can re-upload. Never edit extracted PHI in this queue — send it back to the org for correction.',
 'extraction.approve', '/dashboard/hive-exec/approvals'),

('Approve a Billing submission', 'billing-approval', 'Billing Approvals',
'Compliance & Approvals → Billing Approvals lists org-submitted billing batches awaiting exec sign-off. Review the warnings panel (unit math, missing authorizations, EVV gaps). Approve to release the batch for state submission, or Reject to bounce it back to the org with a reason. HHS/RHS daily-rate math and EVV-mandated code checks are enforced upstream — the queue only surfaces batches that already passed automated scrubbing.',
 'billing.approve', '/dashboard/hive-exec/billing-approvals'),

('Add or edit an Agreement Requirement', 'agreements-requirements', 'Agreements Matrix',
'Compliance & Approvals → Agreements Matrix → Requirements lets execs define the master checklist of paperwork every provider must have (BAA, Business Associate Agreement, Terms of Service, DPA, etc.). Click "New requirement" to add one; each requirement can be marked required or optional and given a renewal cadence. Requirements are used to compute per-org status on the Agreements Matrix.',
 'agreements.manage', '/dashboard/hive-exec/agreements/requirements'),

('Record an Agreement status for an org', 'agreements-record-status', 'Agreements Matrix',
'From the Agreements Matrix, click an org to open its per-agreement view. For each requirement, set status (Not Started / In Progress / Signed / Expired), signed_on, expires_on, and paste the storage link or reference for the executed document (no PHI ever). The matrix flips green when every required agreement is Signed and unexpired.',
 'agreements.manage', '/dashboard/hive-exec/agreements'),

('Onboard a new State (template)', 'state-onboarding', 'States',
'Configuration → States lists every state HIVE supports. Click "New state" to start an onboarding session, then walk the wizard: base template selection, state-specific requirement sources, derived requirements, structural gaps. Save as a state_template that new orgs in that state inherit. Utah (DSPD) is the reference implementation — clone it as a starting point for other states.',
 'states.edit', '/dashboard/hive-exec/states'),

('Adjust Plans & Billing tiers', 'plans-billing', 'Plans & Billing',
'Growth & Accounts → Plans & Billing exposes the plan catalog and per-org subscription state. Editing a plan updates the price and feature bundle; changing an org''s plan updates org_subscriptions and triggers the corresponding feature toggles via the Feature Registry mapping. Never edit an org''s payment records directly — use the org''s billing surface.',
 'billing.approve', '/dashboard/hive-exec/plans'),

('File an IT / Functionality report', 'functionality-report', 'IT / Functionality',
'Operations & Support → IT / Functionality is the intake for platform-level technical issues. Enter a title, category, severity, and description. The server strips potential PHI before persisting to functionality_reports. Use this channel for bugs, integration failures, or feature requests — not for org-support tickets (those go to the Support Queue).',
 'support.manage', '/dashboard/hive-exec/functionality'),

('Send a Message from the Message Center', 'message-center', 'Message Center',
'Operations & Support → Message Center lets execs send broadcast or targeted messages to org admins. Pick recipients (all orgs, a plan tier, or specific orgs), draft the message, attach optional links (never PHI), and send. Delivered messages appear in the recipient''s in-app inbox; read receipts flow into exec_message_recipients.',
 'support.manage', '/dashboard/hive-exec/messages'),

('What Steve can and cannot do (Guide-me phase)', 'about-steve', 'Steve',
'Steve is the Executive Command Center assistant. In this phase Steve is a Guide-me tool: he answers questions about how to use and configure HIVE by retrieving from the authored hive_knowledge base. Steve does NOT read organization data, client records, financials, or PHI in this phase — those capabilities are planned separately. If Steve cannot find an answer in the knowledge base he will say so and point you to a likely surface rather than fabricate steps.',
 'steve.use', '/dashboard/hive-exec/command');
