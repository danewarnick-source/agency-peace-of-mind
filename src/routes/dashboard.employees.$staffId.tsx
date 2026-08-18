import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ShieldAlert,
  FileText,
  Clock,
  AlertTriangle,
  ClipboardList,
  Upload,
  Pencil,
  Eye,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Plus,
  Trash2,
  CalendarDays,
  UserCircle,
  Camera,
  Contact,
  Users as UsersIcon,
  Briefcase,
  GraduationCap,
  Activity as ActivityIcon,
  Lock,
  FolderArchive,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StaffPhotoCard } from "@/components/staff/staff-photo-card";
import { PersonAvatar } from "@/components/person/person-avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionPanel, SectionGroup } from "@/components/clients/section-panel";

import { RequirePermission } from "@/components/rbac-guard";
import { StaffTypeEditor } from "@/components/hr/staff-type-editor";
import { TrainingRequirementField } from "@/components/hr/training-requirement-field";
import { POSITIONS, type Position } from "@/lib/employee-positions";
import { EmployeeDocumentsCard } from "@/components/employees/employee-documents-card";
import { EmployeeFaceSheetButton } from "@/components/employees/employee-face-sheet-button";
import { StaffHrChecklistCard } from "@/components/hr/staff-hr-checklist-card";
import { CustomAttributesSection } from "@/components/custom-attributes-section";
import { LifecyclePanel } from "@/components/lifecycle-panel";
import { SuggestedTopicsInput } from "@/components/ce/suggested-topics-input";
import {
  getStaffPii,
  updateStaffPii,
  getStaffTrainingRiskFlags,
} from "@/lib/hr-staff.functions";
import { setMemberGrants } from "@/lib/team-access.functions";
import { useDeadlines, type DeadlineItem } from "@/hooks/use-deadlines";
import { usePermissions } from "@/hooks/use-permissions";
import { StaffPermissionsTab } from "@/components/employees/staff-permissions-tab";
import { ALL_PERMISSIONS, type Permission } from "@/lib/rbac";

const PROFILE_TABS = ["record", "profile", "activity", "permissions"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

export const Route = createFileRoute("/dashboard/employees/$staffId")({
  validateSearch: (s: Record<string, unknown>): { tab?: ProfileTab; override_perm?: Permission } => {
    const out: { tab?: ProfileTab; override_perm?: Permission } = {};
    if (typeof s.tab === "string" && (PROFILE_TABS as readonly string[]).includes(s.tab)) {
      out.tab = s.tab as ProfileTab;
    }
    if (typeof s.override_perm === "string" && (ALL_PERMISSIONS as readonly string[]).includes(s.override_perm)) {
      out.override_perm = s.override_perm as Permission;
    }
    return out;
  },
  component: () => (
    <RequirePermission perm="manage_users">
      <StaffProfilePage />
    </RequirePermission>
  ),
});

function sectionStorageKey(staffId: string, section: string): string {
  return `hive:staff-record-section:${staffId}:${section}`;
}

/**
 * Collapsible variant of SectionGroup for the Staff record tab — everything
 * below ComplianceStatusHeader defaults to collapsed so the page needs zero
 * scrolling on open. Expanded/collapsed state persists per staff member in
 * localStorage so it survives re-visiting the same profile this session.
 */
function CollapsibleSectionGroup({
  storageKey,
  label,
  hint,
  summary,
  divider,
  children,
}: {
  storageKey: string;
  label: string;
  hint?: string;
  summary: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    setOpen(stored === "open");
    // Re-read when the section identity changes (e.g. navigating between staff profiles).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") window.localStorage.setItem(storageKey, next ? "open" : "closed");
      return next;
    });
  };

  return (
    <section className={divider ? "space-y-5 pt-8 border-t border-border/60" : "space-y-5"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left hover:bg-muted/40"
      >
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
            {label}
          </h2>
          <span className="truncate text-xs text-muted-foreground/80">
            {open ? hint : summary}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="space-y-6">{children}</div>}
    </section>
  );
}

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const { tab, override_perm } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const navigate = Route.useNavigate();
  const activeTab: ProfileTab = tab ?? "record";
  const { can: canManagePermissions } = usePermissions();
  const showPermissionsTab = canManagePermissions("manage_permissions");

  const orgId = org?.organization_id;
  const isSelf = user?.id === staffId;

  // Membership + basic non-PII profile. Org-scoped — RLS denies cross-org reads.
  const memberQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-profile", orgId, staffId],
    queryFn: async () => {
      const { data: m, error: mErr } = await supabase
        .from("organization_members")
        .select("id, role, job_title, active, user_id, created_at")
        .eq("organization_id", orgId!)
        .eq("user_id", staffId)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!m) return null;
      // NOTE: `phone` is NOT a column on profiles yet. Selecting it here
      // caused PostgREST to reject the whole request and left the profile
      // page blank ("Name not set") even for staff with populated roster
      // data. Keep this select in sync with the actual profiles schema; add
      // a phone column via migration before re-adding it here.
      const { data: p, error: pErr } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, full_name, email, username, employee_id, position, positions, department, hire_date, start_date, end_date, account_status, worker_type, team_id, photo_path, photo_updated_at, phone, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, staff_type_keys, ce_suggested_topics, requires_deescalation, requires_abi" as any)
        .eq("id", staffId)
        .maybeSingle();
      if (pErr) throw pErr;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { member: m, profile: (p ?? null) as any };
    },
  });

  // Org staff-types catalog → labels for the derived org-title tier in the header.
  const staffTypesCatalogQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-types-catalog", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_types")
        .select("key, label")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as Array<{ key: string; label: string }>;
    },
  });

  // Team + manager
  const teamId = memberQ.data?.profile?.team_id ?? null;
  const teamQ = useQuery({
    enabled: !!teamId,
    queryKey: ["staff-team", teamId],
    queryFn: async () => {
      const { data: t } = await supabase
        .from("teams")
        .select("id, team_name, manager_id")
        .eq("id", teamId!)
        .maybeSingle();
      if (!t) return null;
      let managerName: string | null = null;
      if (t.manager_id) {
        const { data: mp } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", t.manager_id)
          .maybeSingle();
        managerName = mp?.full_name ?? null;
      }
      return { team_name: t.team_name as string, manager_name: managerName };
    },
  });

  // Doc count for the collapsed "HR documents" summary — same queryKey as
  // StaffHrDocsPanel's own fetch, so React Query dedupes.
  const hrDocsCountQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-profile-hrdocs", orgId, staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documents")
        .select("id, document_kind, file_name, created_at, size_bytes")
        .eq("organization_id", orgId!)
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // All active teams in the org (for team picker)
  const teamsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-teams", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId!)
        .eq("active", true)
        .order("team_name");
      return data ?? [];
    },
  });

  // All active clients in the org (for caseload picker)
  const allClientsQ = useQuery({
    enabled: !!orgId,
    queryKey: ["org-clients-list", orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", orgId!)
        .eq("account_status", "active")
        .order("last_name");
      return data ?? [];
    },
  });

  if (!orgId || memberQ.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading staff profile…</div>;
  }
  if (memberQ.data === null) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-6 text-sm text-rose-700">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          Staffer not found in your organization.
        </CardContent>
      </Card>
    );
  }

  const m = memberQ.data!.member;
  const p = memberQ.data!.profile;
  const name =
    (p?.full_name && String(p.full_name).trim()) ||
    (p?.username && String(p.username).trim()) ||
    (p?.email && String(p.email).trim()) ||
    "Name not set";

  const positions = (() => {
    const list = ((p?.positions as string[] | null) ?? []).filter(Boolean);
    const fallback = p?.position ? [p.position as string] : [];
    return list.length ? list : fallback;
  })();

  // Derive the org-title tier from the employee's selected staff types.
  // Composition rules:
  //   • Primary = first key in profiles.staff_type_keys (provider-ordered).
  //   • 1–3 types → labels joined with " / " (primary first).
  //   • 4+ types → "<primary label> and N more" to keep the header scannable.
  const orgTitle = (() => {
    const keys = ((p?.staff_type_keys as string[] | null) ?? []).filter(Boolean);
    if (keys.length === 0) return null;
    const byKey = new Map(
      (staffTypesCatalogQ.data ?? []).map((t) => [t.key, t.label]),
    );
    const labels = keys.map((k) => byKey.get(k) ?? k);
    if (labels.length <= 3) return labels.join(" / ");
    return `${labels[0]} and ${labels.length - 1} more`;
  })();


  const invalidateProfile = () => {
    qc.invalidateQueries({ queryKey: ["staff-profile", orgId, staffId] });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hub/employees" })}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Employees
          </Button>
          <PersonAvatar
            bucket="staff-photos"
            path={(p?.photo_path as string | null) ?? null}
            name={name}
            className="h-11 w-11"
          />
          <div>
            <h1 className="text-xl font-semibold leading-tight">{name}</h1>
            {/* Tier 2: derived org title from selected staff types (job title). */}
            {orgTitle ? (
              <p className="text-sm font-medium text-foreground/80">{orgTitle}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No staff type selected
              </p>
            )}
            {/* Tier 3: HIVE system status — platform access level, not job title. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <Badge
                variant="outline"
                className="border-primary/30 bg-primary/5 uppercase tracking-wide text-primary"
                title="HIVE platform role"
              >
                {m.role}
              </Badge>
              <Badge
                variant="outline"
                className={
                  m.active
                    ? "border-emerald-300 bg-emerald-50 uppercase tracking-wide text-emerald-700"
                    : "border-muted-foreground/30 bg-muted uppercase tracking-wide text-muted-foreground"
                }
                title="HIVE account status"
              >
                {m.active ? "Active" : "Deactivated"}
              </Badge>
              {/* Face Sheet trigger — same placement as the client header's
                  Face Sheet pill (immediately next to the status badge). */}
              <EmployeeFaceSheetButton staffId={staffId} organizationId={orgId} variant="pill" />
              {p?.hire_date && (
                <span className="text-muted-foreground">· Hired {p.hire_date}</span>
              )}
            </div>
          </div>

        </div>
        <Button variant="outline" onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hub/employees" })}>
          Back to list (quick edit)
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: v === "record" ? undefined : (v as ProfileTab) }) })}
        className="w-full"
      >
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="record">Staff record</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {showPermissionsTab && <TabsTrigger value="permissions">Permissions</TabsTrigger>}
        </TabsList>

        {/* ----- STAFF RECORD (default) ----- */}
        {/* Document Vault, training hours & document history, HR documents,
            and sensitive HR — a plain record of what's on file. Compliance
            status (due/overdue) lives in Company Obligations, not here. */}
        <TabsContent value="record" className="mt-4 space-y-10">
          <DocumentVaultCard
            organizationId={orgId}
            staffId={staffId}
            isSelf={isSelf}
          />

          <CollapsibleSectionGroup
            storageKey={sectionStorageKey(staffId, "checklist")}
            label="Training & document history"
            hint="Annual training hours tracker and signed training history"
            summary="Training hours tracker & signed history"
          >
            <SectionPanel icon={GraduationCap} accent="amber">
              <StaffHrChecklistCard
                organizationId={orgId}
                staffId={staffId}
                view="checklist"
                filter="all"
              />
            </SectionPanel>
          </CollapsibleSectionGroup>

          <CollapsibleSectionGroup
            storageKey={sectionStorageKey(staffId, "hrdocs")}
            label="HR documents"
            hint="Signed & uploaded files"
            summary={
              (hrDocsCountQ.data?.length ?? 0) > 0
                ? `${hrDocsCountQ.data!.length} document${hrDocsCountQ.data!.length === 1 ? "" : "s"} on file`
                : "No documents uploaded"
            }
            divider
          >
            <SectionPanel icon={FolderArchive} accent="violet">
              <StaffHrDocsPanel organizationId={orgId} staffId={staffId} />
            </SectionPanel>
          </CollapsibleSectionGroup>

          <CollapsibleSectionGroup
            storageKey={sectionStorageKey(staffId, "sensitive")}
            label="Sensitive HR"
            hint="Restricted access"
            summary="Restricted access · admin only"
            divider
          >
            <SectionPanel icon={Lock} accent="rose">
              <HrSensitiveCard
                orgId={orgId}
                staffId={staffId}
                isSelf={isSelf}
                orgRole={org?.role}
              />
            </SectionPanel>
          </CollapsibleSectionGroup>
        </TabsContent>

        {/* ----- PROFILE ----- */}
        {/* Identity/contact + at-a-glance, client assignments (placeholder —
            built out in a separate prompt), staff types & schedule, training
            requirement settings, custom attributes, and danger zone. */}
        <TabsContent value="profile" className="mt-4 space-y-6">
          <div className="grid gap-6 items-start lg:grid-cols-[1.65fr_1fr]">
            {/* Main column: identity & contact panels stack vertically. */}
            <div className="space-y-6">
              <SectionGroup label="Identity & contact" hint="Who this person is">
                <SectionPanel icon={Camera} accent="indigo">
                  <StaffPhotoCard orgId={orgId} staffId={staffId} name={name} />
                </SectionPanel>
                <SectionPanel icon={Contact} accent="violet">
                  <ContactCard
                    orgId={orgId}
                    staffId={staffId}
                    p={p}
                    m={m}
                    positions={positions}
                    onSaved={invalidateProfile}
                  />
                </SectionPanel>
                <SectionPanel icon={UsersIcon} accent="sky">
                  <TeamCard
                    orgId={orgId}
                    staffId={staffId}
                    teamId={teamId}
                    teamData={teamQ.data ?? null}
                    allTeams={teamsQ.data ?? []}
                    orgRole={org?.role}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["staff-profile", orgId, staffId] });
                      qc.invalidateQueries({ queryKey: ["staff-team", teamId] });
                    }}
                  />
                </SectionPanel>
              </SectionGroup>
            </div>

            {/* Right column: at-a-glance summary — parallels the client's
                right-column summary card. */}
            <div className="space-y-4">
              <AtGlanceEmployeeCard
                orgTitle={orgTitle}
                role={m.role}
                active={m.active}
                hireDate={(p?.hire_date as string | null) ?? null}
                teamName={teamQ.data?.team_name ?? null}
                employeeId={(p?.employee_id as string | null) ?? null}
                phone={(p?.phone as string | null) ?? null}
                email={(p?.email as string | null) ?? null}
                department={(p?.department as string | null) ?? null}
              />
            </div>
          </div>

          <SectionGroup label="Client assignments" hint="Caseload" divider>
            <SectionPanel icon={UserCircle} accent="rose">
              <Card>
                <CardHeader><CardTitle>Client assignments</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">Client assignments — coming soon</CardContent>
              </Card>
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Staff types & schedule" hint="Union rule: required for any type selected" divider>
            <SectionPanel icon={Briefcase} accent="teal">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Staff types
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      Union rule: required for any type selected
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <StaffTypeEditor organizationId={orgId} staffId={staffId} />
                </CardContent>
              </Card>
            </SectionPanel>
            <SectionPanel icon={CalendarDays} accent="amber">
              <Card>
                <CardHeader><CardTitle className="text-base">Schedule</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <p>View and manage shifts for this staff member in the scheduler.</p>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/dashboard/scheduler">
                        <CalendarDays className="mr-1 h-3.5 w-3.5" /> Open scheduler →
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Training requirement settings" hint="Required / Exempt & suggested CE focus" divider>
            <SectionPanel icon={ShieldAlert} accent="rose">
              <BehaviorTrainingRequirementsCard
                organizationId={orgId}
                staffId={staffId}
                requiresDeescalation={(p?.requires_deescalation as boolean | null | undefined) !== false}
                requiresAbi={(p?.requires_abi as boolean | null | undefined) !== false}
                onSaved={invalidateProfile}
              />
            </SectionPanel>
            <SectionPanel icon={Sparkles} accent="violet">
              <CeSuggestedTopicsCard
                staffId={staffId}
                topics={((p?.ce_suggested_topics as string[] | null) ?? [])}
                onSaved={invalidateProfile}
              />
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Employee documents" hint="Uploaded records & autofill" divider>
            <SectionPanel icon={FolderArchive} accent="emerald">
              <EmployeeDocumentsCard
                organizationId={orgId}
                staffId={staffId}
                onProfileMaybeChanged={invalidateProfile}
              />
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Custom attributes" hint="Extra fields imported or added manually" divider>
            <SectionPanel icon={ClipboardList} accent="sky">
              <CustomAttributesSection
                organizationId={orgId}
                entityKind="employee"
                entityId={staffId}
              />
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Danger zone" hint="Archive or permanently delete this record" divider>
            <SectionPanel icon={AlertTriangle} accent="rose">
              <LifecyclePanel
                kind="employee"
                id={staffId}
                fullName={name}
                organizationId={orgId}
                onDone={() => router.navigate({ to: "/dashboard/hub/employees" })}
                onDeleted={() => router.navigate({ to: "/dashboard/hub/employees" })}
              />
            </SectionPanel>
          </SectionGroup>
        </TabsContent>

        {/* ----- ACTIVITY ----- */}
        <TabsContent value="activity" className="mt-4 space-y-10">
          <SectionGroup label="Activity" hint="Shifts, notes & recent actions">
            <SectionPanel icon={ActivityIcon} accent="sky">
              <ActivityFeed organizationId={orgId} staffId={staffId} />
            </SectionPanel>
          </SectionGroup>

          <SectionGroup label="Deadlines" hint="Renewals & acknowledgements" divider>
            <SectionPanel icon={CalendarClock} accent="amber">
              <StaffDeadlinesList staffId={staffId} />
            </SectionPanel>
          </SectionGroup>
        </TabsContent>

        {/* ----- PERMISSIONS (owner-only) ----- */}
        {showPermissionsTab && (
          <TabsContent value="permissions" className="mt-4 space-y-6">
            {orgId && (
              <StaffPermissionsTab
                organizationId={orgId}
                staffId={staffId}
                initialOverridePermission={override_perm}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

type DocumentVaultRow = {
  id: string;
  file_name: string;
  created_at: string;
  nectar_cert_type: string | null;
  nectar_expires_at: string | null;
};

/**
 * Replaces the old checklist-driven compliance-status header: this is now a
 * plain, non-judgmental record of what's on file (uploaded documents, when,
 * and what NECTAR read off them) — Company Obligations, not this page, is
 * the tracker of record for whether something is due/overdue.
 */
function DocumentVaultCard({
  organizationId,
  staffId,
  isSelf,
}: {
  organizationId: string;
  staffId: string;
  isSelf: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["staff-document-vault", organizationId, staffId],
    enabled: !!organizationId && !!staffId,
    queryFn: async (): Promise<DocumentVaultRow[]> => {
      const [{ data: docs, error: dErr }, { data: completions, error: cErr }] = await Promise.all([
        supabase
          .from("hr_documents")
          .select("id, file_name, created_at")
          .eq("organization_id", organizationId)
          .eq("staff_id", staffId)
          .order("created_at", { ascending: false }),
        supabase
          .from("staff_baseline_training_completions")
          .select("evidence_document_id, nectar_extracted_cert_type, expires_at")
          .eq("organization_id", organizationId)
          .eq("staff_id", staffId),
      ]);
      if (dErr) throw new Error(dErr.message);
      if (cErr) throw new Error(cErr.message);
      const nectarByDoc = new Map(
        (completions ?? [])
          .filter((c) => !!c.evidence_document_id)
          .map((c) => [c.evidence_document_id as string, c]),
      );
      return (docs ?? []).map((d) => {
        const match = nectarByDoc.get(d.id) as { nectar_extracted_cert_type: string | null; expires_at: string | null } | undefined;
        return {
          id: d.id,
          file_name: d.file_name,
          created_at: d.created_at,
          nectar_cert_type: match?.nectar_extracted_cert_type ?? null,
          nectar_expires_at: match?.expires_at ?? null,
        };
      });
    },
  });

  const obligationsHref = isSelf ? "/dashboard/my-obligations" : `/dashboard/my-obligations?staff=${staffId}`;

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Document Vault</p>
          <a href={obligationsHref} className="text-sm font-medium text-[#137182] hover:underline">
            View compliance obligations →
          </a>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {data.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Uploaded {new Date(d.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {d.nectar_cert_type && ` · NECTAR read: ${d.nectar_cert_type}`}
                  </p>
                </div>
                {d.nectar_expires_at && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Expires {new Date(d.nectar_expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Deadlines list — inline, staff-scoped slice of the global deadlines
 * desk (src/hooks/use-deadlines.tsx), for the Activity tab.
 * ====================================================================*/
function fmtDeadlineDue(d: Date): string {
  const now = Date.now();
  const ms = d.getTime() - now;
  const days = Math.round(ms / 86_400_000);
  const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (ms < 0) {
    const od = Math.abs(days);
    return `${date} · ${od}d overdue`;
  }
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  return `${date} · in ${days}d`;
}

function StaffDeadlinesList({ staffId }: { staffId: string }) {
  const { items, isLoading } = useDeadlines();

  const staffItems = useMemo(() => {
    return items
      .filter((i: DeadlineItem) => i.staffId === staffId)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, 5);
  }, [items, staffId]);

  if (isLoading) {
    return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading deadlines…</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {staffItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
        ) : (
          <div className="space-y-2">
            {staffItems.map((item) => {
              const toneText =
                item.status === "overdue"
                  ? "text-rose-700 dark:text-rose-300"
                  : item.status === "due_soon"
                    ? "text-amber-700 dark:text-amber-200"
                    : "text-muted-foreground";
              const dotCls =
                item.status === "overdue"
                  ? "bg-rose-500"
                  : item.status === "due_soon"
                    ? "bg-amber-500"
                    : "bg-muted-foreground/40";
              return (
                <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <span className={`mr-2 inline-block h-2 w-2 rounded-full ${dotCls}`} />
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{item.subject}</span>
                  </div>
                  <span className={`text-xs font-mono ${toneText}`}>{fmtDeadlineDue(item.dueAt)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="pt-1">
          <Link to="/dashboard/deadlines" className="text-sm underline">View all deadlines →</Link>
        </div>
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Contact & Position card — read view + inline edit for non-PII fields.
 * ====================================================================*/
function ContactCard({
  orgId,
  staffId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  p,
  m,
  positions,
  onSaved,
}: {
  orgId: string;
  staffId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  p: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  m: any;
  positions: string[];
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const setGrantsFn = useServerFn(setMemberGrants);
  const [draft, setDraft] = useState({
    full_name: "",
    email: "",
    phone: "",
    employee_id: "",
    department: "",
    worker_type: "w2",
    start_date: "",
    end_date: "",
    positions: [] as Position[],
    role: "employee",
    active: true,
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
  });

  const startEdit = () => {
    const positionsArr = ((p?.positions as string[] | null) ?? []).filter(Boolean);
    const initialPositions = positionsArr.filter((x): x is Position => POSITIONS.includes(x as Position));
    setDraft({
      full_name: p?.full_name ?? "",
      email: p?.email ?? "",
      phone: p?.phone ?? "",
      employee_id: p?.employee_id ?? "",
      department: p?.department ?? "",
      worker_type: p?.worker_type === "1099" ? "1099" : "w2",
      start_date: p?.start_date ?? p?.hire_date ?? "",
      end_date: p?.end_date ?? "",
      positions: initialPositions.length ? initialPositions : (p?.position ? [p.position as Position] : []),
      role: m.role,
      active: m.active,
      emergency_contact_name: p?.emergency_contact_name ?? "",
      emergency_contact_relationship: p?.emergency_contact_relationship ?? "",
      emergency_contact_phone: p?.emergency_contact_phone ?? "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (draft.start_date && draft.end_date && draft.end_date < draft.start_date) {
        throw new Error("End date must be on or after Start date.");
      }
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          full_name: draft.full_name,
          email: draft.email || null,
          phone: draft.phone || null,
          employee_id: draft.employee_id || null,
          department: draft.department || null,
          worker_type: draft.worker_type,
          position: draft.positions[0] ?? null,
          positions: draft.positions,
          start_date: draft.start_date || null,
          end_date: draft.end_date || null,
          // Kept in sync with start_date — there is no independent "hire date"
          // concept elsewhere in the product (onboarding only asks for Start date).
          hire_date: draft.start_date || null,
          emergency_contact_name: draft.emergency_contact_name || null,
          emergency_contact_relationship: draft.emergency_contact_relationship || null,
          emergency_contact_phone: draft.emergency_contact_phone || null,
        } as any)
        .eq("id", staffId);
      if (error) throw new Error(error.message);

      const { error: mErr } = await supabase
        .from("organization_members")
        .update({ active: draft.active })
        .eq("id", m.id);
      if (mErr) throw new Error(mErr.message);

      if (draft.role !== m.role) {
        await setGrantsFn({
          data: {
            organization_id: orgId,
            membership_id: m.id,
            target_user_id: staffId,
            explicit_role: draft.role as "admin" | "committee_member" | "employee" | "manager" | "super_admin",
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      onSaved();
    },
    onError: (e) =>
      toast.error(
        (e as Error).message.includes("Unauthorized")
          ? "Only organization admins can change user roles."
          : (e as Error).message,
      ),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Contact &amp; position
        </CardTitle>
        <RequirePermission perm="manage_users">
          <button
            type="button"
            aria-label="Edit contact"
            onClick={editing ? () => setEditing(false) : startEdit}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:border-muted-foreground/40"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </RequirePermission>
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="space-y-0">
            <Row label="Full name" value={p?.full_name ?? "—"} />
            <Row label="Email" value={p?.email ?? "—"} />
            <Row label="Phone" value={p?.phone ?? "—"} />
            <Row label="Employee ID" value={p?.employee_id ?? "—"} />
            <Row label="Position" value={positions.length ? positions.join(", ") : "—"} />
            <Row label="System role" value={m.role} />
            <Row label="Worker type" value={p?.worker_type === "1099" ? "1099 contractor" : "W-2 employee"} />
            <Row label="Status" value={m.active ? "Active" : "Deactivated"} />
            <Row label="Department" value={p?.department ?? "—"} />
            <Row label="Start date" value={p?.start_date ?? p?.hire_date ?? "—"} />
            <Row label="End date" value={p?.end_date ?? "—"} />
            <div className="pt-2 mt-2 border-t border-border/60">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Emergency contact</div>
              <Row label="Name" value={p?.emergency_contact_name ?? "—"} />
              <Row label="Relationship" value={p?.emergency_contact_relationship ?? "—"} />
              <Row label="Phone" value={p?.emergency_contact_phone ?? "—"} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Full name</Label>
              <Input
                type="text"
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</Label>
              <Input
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="(801) 555-0100"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Employee ID</Label>
              <Input
                type="text"
                value={draft.employee_id}
                onChange={(e) => setDraft({ ...draft, employee_id: e.target.value })}
                placeholder="EMP-001"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Agency position</Label>
              <p className="text-[11px] text-muted-foreground">Select one or more.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {POSITIONS.map((pos) => {
                  const checked = draft.positions.includes(pos);
                  const id = `staff-position-${pos.replace(/\s+/g, "-").toLowerCase()}`;
                  return (
                    <label
                      key={pos}
                      htmlFor={id}
                      className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 hover:bg-muted/40"
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            positions: v
                              ? Array.from(new Set([...d.positions, pos]))
                              : d.positions.filter((x) => x !== pos),
                          }))
                        }
                      />
                      <span className="text-sm">{pos}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">System role</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Staff</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Employment status</Label>
              <Select
                value={draft.active ? "true" : "false"}
                onValueChange={(v) => setDraft({ ...draft, active: v === "true" })}
              >
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Deactivated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Department</Label>
              <Input
                type="text"
                value={draft.department}
                onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                placeholder="Direct Support"
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Worker type</Label>
              <Select
                value={draft.worker_type}
                onValueChange={(v) => setDraft({ ...draft, worker_type: v })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="w2">W-2 employee</SelectItem>
                  <SelectItem value="1099">1099 contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Start date</Label>
                <Input
                  type="date"
                  value={draft.start_date}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Drives Continuing Education eligibility & year window.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">End date (optional)</Label>
                <Input
                  type="date"
                  value={draft.end_date}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">Blank for active employees. Pauses new CE; history retained.</p>
              </div>
            </div>
            <div className="pt-2 mt-2 border-t border-border/60 space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Emergency contact</div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Name</Label>
                <Input
                  type="text"
                  value={draft.emergency_contact_name}
                  onChange={(e) => setDraft({ ...draft, emergency_contact_name: e.target.value })}
                  placeholder="Full name"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Relationship</Label>
                <Input
                  type="text"
                  value={draft.emergency_contact_relationship}
                  onChange={(e) => setDraft({ ...draft, emergency_contact_relationship: e.target.value })}
                  placeholder="Spouse, parent, sibling…"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Phone</Label>
                <Input
                  type="tel"
                  value={draft.emergency_contact_phone}
                  onChange={(e) => setDraft({ ...draft, emergency_contact_phone: e.target.value })}
                  placeholder="(801) 555-0100"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Behavior-related training requirements — explicit Required/Exempt
 * setting per staffer, with a compliance-risk warning before exempting
 * someone currently assigned to a behavior-coded or ABI client.
 * ====================================================================*/
function BehaviorTrainingRequirementsCard({
  organizationId,
  staffId,
  requiresDeescalation,
  requiresAbi,
  onSaved,
}: {
  organizationId: string;
  staffId: string;
  requiresDeescalation: boolean;
  requiresAbi: boolean;
  onSaved: () => void;
}) {
  const fetchRiskFlags = useServerFn(getStaffTrainingRiskFlags);
  const riskFlagsQ = useQuery({
    queryKey: ["staff-training-risk", organizationId, staffId],
    queryFn: () => fetchRiskFlags({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const saveMutation = useMutation({
    mutationFn: async (next: { requires_deescalation?: boolean; requires_abi?: boolean }) => {
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(next as any)
        .eq("id", staffId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Behavior-related training requirements</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TrainingRequirementField
          label="De-escalation training"
          hint="Typically required for staff assigned to a behavior-coded client (BC1/2/3) or a client with a Behavior Support Plan."
          value={requiresDeescalation}
          onChange={(v) => saveMutation.mutate({ requires_deescalation: v })}
          atRisk={!!riskFlagsQ.data?.has_behavior_client}
          warningText="Are you sure? This staff member is assigned to a client with behavior supports. De-escalation training is typically required for staff working with this code. Marking this exempt without proper justification could cause compliance issues in an audit."
        />
        <TrainingRequirementField
          label="ABI training"
          hint="Typically required for staff assigned to a client with an ABI (acquired brain injury) designation."
          value={requiresAbi}
          onChange={(v) => saveMutation.mutate({ requires_abi: v })}
          atRisk={!!riskFlagsQ.data?.has_abi_client}
          warningText="Are you sure? This staff member is assigned to a client with an ABI designation. ABI training is typically required for staff working with this client. Marking this exempt without proper justification could cause compliance issues in an audit."
        />
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Suggested CE focus topics — steers Nectar's monthly CE review for
 * this staffer.
 * ====================================================================*/
function CeSuggestedTopicsCard({
  staffId,
  topics,
  onSaved,
}: {
  staffId: string;
  topics: string[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(topics);
  const [dirty, setDirty] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ ce_suggested_topics: draft } as any)
        .eq("id", staffId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved");
      setDirty(false);
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <SuggestedTopicsInput
          value={draft}
          onChange={(next) => { setDraft(next); setDirty(true); }}
        />
        {dirty && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(topics); setDirty(false); }}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * Team card — shows team assignment; admin/manager can reassign inline.
 * ====================================================================*/
function TeamCard({ orgId, staffId, teamId, teamData, allTeams, orgRole, onSaved }: {
  orgId: string;
  staffId: string;
  teamId: string | null;
  teamData: { team_name: string; manager_name: string | null } | null;
  allTeams: Array<{ id: string; team_name: string }>;
  orgRole: string | undefined;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? "");
  const [saving, setSaving] = useState(false);
  const canEdit = orgRole === "admin" || orgRole === "manager";

  const save = async () => {
    setSaving(true);
    try {
      if (selectedTeamId) {
        const { data: desig } = await supabase
          .from("home_designations")
          .select("id")
          .eq("organization_id", orgId)
          .eq("active", true)
          .order("sort")
          .limit(1)
          .maybeSingle();
        if (!desig?.id) throw new Error("No staff designations configured. Add one in Homes & Teams first.");
        const { error } = await supabase.from("home_staff_designations").upsert(
          { organization_id: orgId, team_id: selectedTeamId, staff_id: staffId, designation_id: desig.id },
          { onConflict: "team_id,staff_id" }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("home_staff_designations")
          .delete()
          .eq("staff_id", staffId)
          .eq("organization_id", orgId);
        if (error) throw error;
      }
      toast.success("Team updated");
      setEditing(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update team");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Team</CardTitle>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => { setSelectedTeamId(teamId ?? ""); setEditing(true); }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
            aria-label="Edit team"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="text-sm">
        {editing ? (
          <div className="space-y-3">
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a team…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">— No team —</SelectItem>
                {allTeams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.team_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : teamData ? (
          <div className="grid gap-1">
            <Row label="Team" value={teamData.team_name} />
            <Row label="Reports to" value={teamData.manager_name ?? "—"} />
          </div>
        ) : (
          <p className="text-muted-foreground">Not assigned to a team.</p>
        )}
      </CardContent>
    </Card>
  );
}

/* ======================================================================
 * HR — sensitive info card. Phone (personal), hourly rate, daily rate.
 * Uses getStaffPii server fn (fail-closed). Edit gated to admin/manager.
 * ====================================================================*/
function HrSensitiveCard({
  orgId,
  staffId,
  isSelf,
  orgRole,
}: {
  orgId: string;
  staffId: string;
  isSelf: boolean;
  orgRole: string | undefined;
}) {
  const qc = useQueryClient();
  const fetchPii = useServerFn(getStaffPii);
  const updatePiiFn = useServerFn(updateStaffPii);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ phone: "", hourly_rate: "", daily_rate: "" });

  const piiQ = useQuery({
    queryKey: ["staff-pii", orgId, staffId],
    queryFn: () => fetchPii({ data: { organization_id: orgId, staff_id: staffId } }),
  });

  const canEdit = !isSelf && (orgRole === "admin" || orgRole === "manager");

  const startEdit = () => {
    setDraft({
      phone: piiQ.data?.staff_id ? "" : "",
      hourly_rate: piiQ.data?.hourly_rate != null ? String(piiQ.data.hourly_rate) : "",
      daily_rate: piiQ.data?.daily_rate != null ? String(piiQ.data.daily_rate) : "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await updatePiiFn({
        data: {
          organization_id: orgId,
          staff_id: staffId,
          hourly_rate: draft.hourly_rate ? Number(draft.hourly_rate) : null,
          daily_rate: draft.daily_rate ? Number(draft.daily_rate) : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["staff-pii", orgId, staffId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (piiQ.isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  if (piiQ.error || !piiQ.data) {
    return (
      <Card className="border-rose-200 bg-rose-50/30">
        <CardContent className="p-5 text-sm text-rose-700">
          <ShieldAlert className="mr-2 inline h-4 w-4" />
          No access to sensitive HR data.
        </CardContent>
      </Card>
    );
  }

  const pii = piiQ.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          HR — sensitive info
        </CardTitle>
        {canEdit && (
          <button
            type="button"
            aria-label="Edit HR"
            onClick={editing ? () => setEditing(false) : startEdit}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 bg-transparent text-muted-foreground hover:bg-muted hover:border-muted-foreground/40"
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {!editing ? (
          <div className="space-y-0">
            <Row label="Hourly rate" value={pii.hourly_rate != null ? `$${Number(pii.hourly_rate).toFixed(2)}/hr` : "—"} />
            <Row label="Daily rate" value={pii.daily_rate != null ? `$${Number(pii.daily_rate).toFixed(2)}/day` : "—"} />
            <p className="mt-3 text-[11px] text-muted-foreground">Visible to admins and team managers only.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Hourly rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.hourly_rate}
                  onChange={(e) => setDraft({ ...draft, hourly_rate: e.target.value })}
                  placeholder="0.00"
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Daily rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.daily_rate}
                  onChange={(e) => setDraft({ ...draft, daily_rate: e.target.value })}
                  placeholder="0.00"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{value}</span>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-[#137182] bg-[#137182] text-white"
          : "border-border bg-card text-muted-foreground hover:border-[#137182]/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ======================================================================
 * Activity feed — read-only SELECTs of staff-linked records.
 * Pulls: evv_timesheets.staff_id, form_submissions.submitted_by,
 * incident_reports.reported_by. Newest first. No writes; respects RLS.
 * ====================================================================*/
type ActivityItem = {
  id: string;
  kind: "Shift" | "Timesheet" | "Form" | "Incident";
  title: string;
  status: string;
  date: string; // ISO
  href?: string;
  // Shift-only detail (preserved from the old StaffShiftsPanel table)
  clientId?: string | null;
  clientName?: string | null;
  serviceCode?: string | null;
  units?: number | null;
};

function ActivityFeed({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const [filter, setFilter] = useState<"all" | "Shift" | "Timesheet" | "Form" | "Incident">("all");

  // EVV timesheets carry both Shift (scheduled) and Timesheet (post-clock) semantics
  // on a single row. We surface every row twice — once tagged Shift if it has a
  // clock-in, once tagged Timesheet if it has an approval/claim status — so the
  // filter chips work intuitively without a separate "shifts" table. Column set
  // matches the previous StaffShiftsPanel so the Shifts filter retains full detail.
  const evvQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-evv", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("evv_timesheets")
        .select("id, client_id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, billed_units")
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map((r) => r.client_id).filter(Boolean))) as string[];
      const nameById = new Map<string, string>();
      if (ids.length) {
        const { data: cs } = await supabase
          .from("clients")
          .select("id, first_name, last_name")
          .in("id", ids);
        for (const c of cs ?? []) {
          nameById.set(c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—");
        }
      }
      return rows.map((r) => ({ ...r, client_name: r.client_id ? nameById.get(r.client_id) ?? "—" : null }));
    },
  });

  const formsQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-forms", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("form_submissions")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, form_id, status, submitted_at, created_at, forms:form_id(name)" as any)
        .eq("organization_id", organizationId)
        .eq("submitted_by", staffId)
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .limit(100);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as Array<any>;
    },
  });

  const incidentsQ = useQuery({
    enabled: !!organizationId,
    queryKey: ["activity-incidents", organizationId, staffId],
    queryFn: async () => {
      const { data } = await supabase
        .from("incident_reports")
        .select("id, report_number, status, incident_date, filed_at, client_id, incident_types")
        .eq("organization_id", organizationId)
        .eq("reported_by", staffId)
        .order("filed_at", { ascending: false, nullsFirst: false })
        .limit(100);
      return data ?? [];
    },
  });

  const items = useMemo<ActivityItem[]>(() => {
    const out: ActivityItem[] = [];
    for (const r of evvQ.data ?? []) {
      const code = r.service_type_code ?? null;
      const units = r.billed_units ?? null;
      const titleSuffix = `${code ?? "Shift"}${units != null ? ` · ${units} u` : ""}`;
      if (r.clock_in_timestamp) {
        out.push({
          id: `evv-shift-${r.id}`,
          kind: "Shift",
          title: titleSuffix,
          status: r.status ? String(r.status) : (r.clock_out_timestamp ? "Clocked out" : "Clocked in"),
          date: r.clock_in_timestamp as string,
          clientId: r.client_id ?? null,
          clientName: r.client_name ?? null,
          serviceCode: code,
          units,
        });
      }
      if (r.status) {
        out.push({
          id: `evv-ts-${r.id}`,
          kind: "Timesheet",
          title: `${code ?? "Timesheet"}${units != null ? ` · ${units} u` : ""}`,
          status: String(r.status),
          date: (r.clock_in_timestamp ?? new Date().toISOString()) as string,
        });
      }
    }
    for (const r of formsQ.data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const formName = (r as any).forms?.name ?? "Form";
      out.push({
        id: `form-${r.id}`,
        kind: "Form",
        title: String(formName),
        status: String(r.status ?? "submitted"),
        date: String(r.submitted_at ?? r.created_at ?? new Date().toISOString()),
      });
    }
    for (const r of incidentsQ.data ?? []) {
      const types = Array.isArray(r.incident_types) ? r.incident_types.join(", ") : "";
      out.push({
        id: `inc-${r.id}`,
        kind: "Incident",
        title: `${r.report_number ?? "Incident"}${types ? ` · ${types}` : ""}`,
        status: String(r.status ?? "filed"),
        date: String(r.filed_at ?? r.incident_date ?? new Date().toISOString()),
      });
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
  }, [evvQ.data, formsQ.data, incidentsQ.data]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const isLoading = evvQ.isLoading || formsQ.isLoading || incidentsQ.isLoading;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Activity</CardTitle>
        <span className="text-xs text-muted-foreground">Read-only · newest first</span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip active={filter === "Shift"} onClick={() => setFilter("Shift")}>Shifts</FilterChip>
          <FilterChip active={filter === "Timesheet"} onClick={() => setFilter("Timesheet")}>Timesheets</FilterChip>
          <FilterChip active={filter === "Form"} onClick={() => setFilter("Form")}>Forms</FilterChip>
          <FilterChip active={filter === "Incident"} onClick={() => setFilter("Incident")}>Incidents</FilterChip>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading activity…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity to show in this filter.</p>
        ) : filter === "Shift" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Client</th>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Units</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {it.date ? new Date(it.date).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {it.clientId ? (
                        <Link
                          to="/dashboard/clients/$clientId"
                          params={{ clientId: it.clientId }}
                          className="hover:underline"
                        >
                          {it.clientName ?? "—"}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2"><code className="font-mono text-xs">{it.serviceCode ?? "—"}</code></td>
                    <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{it.status}</Badge></td>
                    <td className="px-3 py-2 text-right">{it.units ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <KindBadge kind={it.kind} />
                  <span className="truncate font-medium">{it.title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] capitalize">{it.status}</Badge>
                  <span>{new Date(it.date).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function KindBadge({ kind }: { kind: ActivityItem["kind"] }) {
  const map: Record<ActivityItem["kind"], { Icon: typeof FileText; cls: string }> = {
    Shift: { Icon: Clock, cls: "bg-[#137182]/10 text-[#137182]" },
    Timesheet: { Icon: ClipboardList, cls: "bg-[#0B1126]/10 text-[#0B1126]" },
    Form: { Icon: FileText, cls: "bg-muted text-foreground/80" },
    Incident: { Icon: AlertTriangle, cls: "bg-rose-100 text-rose-700" },
  };
  const { Icon, cls } = map[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      <Icon className="h-3 w-3" /> {kind}
    </span>
  );
}

/* ======================================================================
 * Staff HR documents — read-only list. Storage URLs not surfaced here;
 * keeps PII access flow gated through the existing HR checklist card.
 * ====================================================================*/
function StaffHrDocsPanel({ organizationId, staffId }: { organizationId: string; staffId: string }) {
  const q = useQuery({
    enabled: !!organizationId,
    queryKey: ["staff-profile-hrdocs", organizationId, staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_documents")
        .select("id, document_kind, file_name, created_at, size_bytes")
        .eq("organization_id", organizationId)
        .eq("staff_id", staffId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">HR documents on file</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/employees">
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload HR document (in checklist) →
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (q.data ?? []).length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No HR documents on file.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Kind</th>
                  <th className="px-3 py-2 text-left">File name</th>
                  <th className="px-3 py-2 text-left">Uploaded</th>
                  <th className="px-3 py-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2"><Badge variant="outline">{r.document_kind ?? "—"}</Badge></td>
                    <td className="px-3 py-2">{r.file_name ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {r.size_bytes != null ? `${Math.round(Number(r.size_bytes) / 1024)} KB` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Employee at-a-glance summary card ─────────────────────────────────────
// Mirrors the client Profile tab's AtGlanceCard: key facts pulled from data
// already in memberQ / teamQ — no new fetches, purely a right-column summary.
function AtGlanceEmployeeCard({
  orgTitle, role, active, hireDate, teamName, employeeId, phone, email, department,
}: {
  orgTitle: string | null;
  role: string;
  active: boolean;
  hireDate: string | null;
  teamName: string | null;
  employeeId: string | null;
  phone: string | null;
  email: string | null;
  department: string | null;
}) {
  const rows: Array<[string, React.ReactNode]> = [
    ["Title", orgTitle ?? <span className="text-muted-foreground italic">Not set</span>],
    ["HIVE role", <span className="uppercase tracking-wide">{role}</span>],
    ["Status", (
      <span className={active ? "text-emerald-700" : "text-muted-foreground"}>
        {active ? "Active" : "Deactivated"}
      </span>
    )],
    ["Hired", hireDate ?? <span className="text-muted-foreground">—</span>],
    ["Team", teamName ?? <span className="text-muted-foreground">—</span>],
    ["Employee ID", employeeId ?? <span className="text-muted-foreground">—</span>],
    ["Department", department ?? <span className="text-muted-foreground">—</span>],
    ["Phone", phone ?? <span className="text-muted-foreground">—</span>],
    ["Email", email ?? <span className="text-muted-foreground">—</span>],
  ];
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-start gap-2.5 px-5 py-4 border-b border-border/60">
          <span
            aria-hidden
            className="grid place-items-center h-[18px] w-[18px] bg-primary/15 flex-none"
            style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
          >
            <span
              className="block h-[7px] w-[7px] bg-primary"
              style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
            />
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">At a glance</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Key facts pulled from this record</p>
          </div>
        </div>
        <div className="p-5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 py-2 text-sm border-b border-border/60 last:border-0">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-right">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
