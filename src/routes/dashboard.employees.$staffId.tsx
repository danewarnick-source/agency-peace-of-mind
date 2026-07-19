import { useMemo, useState } from "react";
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
  ChevronRight,
  FileSignature,
  Download,
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
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TrainingCertificateDialog, type TrainingCertificateRecord } from "@/components/training/training-certificate-dialog";
import { useCurrentOrg } from "@/hooks/use-org";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { EmployeeDocumentsCard } from "@/components/employees/employee-documents-card";
import { EmployeeFaceSheetButton } from "@/components/employees/employee-face-sheet-button";
import { StaffHrChecklistCard } from "@/components/hr/staff-hr-checklist-card";
import {
  getStaffChecklist,
  getStaffPii,
  updateStaffPii,
  createHrDocumentUploadUrl,
  getHrDocumentUrl,
  upsertChecklistCompletion,
} from "@/lib/hr-staff.functions";
import {
  attachBaselineCertificate,
  setBaselineExpiration,
  adminSignOffBaselineCompletion,
  revokeBaselineSignOff,
} from "@/lib/staff-training-requirements.functions";
import { parseBaselineId, baselineByKey } from "@/lib/staff-training-requirements";
import {
  getStaffAnnualHoursDetail,
  addStaffHoursEntry,
  deleteStaffHoursEntry,
} from "@/lib/hr-training-hours.functions";
import { recordAttestation, listAttestations } from "@/lib/document-attestations.functions";

export const Route = createFileRoute("/dashboard/employees/$staffId")({
  component: () => (
    <RequirePermission perm="manage_users">
      <StaffProfilePage />
    </RequirePermission>
  ),
});

function StaffProfilePage() {
  const { staffId } = Route.useParams();
  const { data: org } = useCurrentOrg();
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

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
        .select("id, full_name, email, username, employee_id, position, positions, department, hire_date, account_status, worker_type, team_id, photo_path, photo_updated_at, phone, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, staff_type_keys" as any)
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

  // Caseload — read-only links to client workspaces.
  const caseloadQ = useQuery({
    enabled: !!orgId,
    queryKey: ["staff-caseload", orgId, staffId],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("staff_assignments")
        .select("client_id, is_group_home_assignment, service_codes")
        .eq("organization_id", orgId!)
        .eq("staff_id", staffId);
      const ids = (rows ?? []).map((r) => r.client_id);
      if (ids.length === 0) return [] as Array<{ id: string; name: string; is_gh: boolean; codes: string[] }>;
      const { data: clients } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .in("id", ids);
      const byId = new Map((clients ?? []).map((c) => [c.id, c]));
      return (rows ?? []).map((r) => {
        const c = byId.get(r.client_id);
        return {
          id: r.client_id,
          name: c ? `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—" : "—",
          is_gh: !!r.is_group_home_assignment,
          codes: (r.service_codes ?? []) as string[],
        };
      });
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

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="profile">Overview</TabsTrigger>
          <TabsTrigger value="requirements">Certs &amp; trainings</TabsTrigger>
          <TabsTrigger value="checklist">Compliance Checklist</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="hrdocs">HR docs</TabsTrigger>
          <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
        </TabsList>

        {/* ----- OVERVIEW ----- */}
        {/* Structure mirrors the client Profile tab: completeness bar → main
            2-col grid (identity/contact + at-a-glance) → assignments group →
            documents group. Same SectionPanel/SectionGroup language as the
            client profile so both surfaces read as one design. */}
        <TabsContent value="profile" className="mt-4 space-y-6">
          <StaffRecordCompletenessBar
            photoPath={(p?.photo_path as string | null) ?? null}
            email={(p?.email as string | null) ?? null}
            phone={(p?.phone as string | null) ?? null}
            employeeId={(p?.employee_id as string | null) ?? null}
            hireDate={(p?.hire_date as string | null) ?? null}
            teamId={teamId}
            staffTypeCount={((p?.staff_type_keys as string[] | null) ?? []).length}
            emergencyName={(p?.emergency_contact_name as string | null) ?? null}
            emergencyPhone={(p?.emergency_contact_phone as string | null) ?? null}
            positionsCount={positions.length}
          />

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

          <SectionGroup label="Assignments & role" hint="Caseload, schedule & staff types" divider>
            <SectionPanel icon={UserCircle} accent="rose">
              <CaseloadCard
                orgId={orgId}
                staffId={staffId}
                caseload={caseloadQ.data ?? []}
                allClients={allClientsQ.data ?? []}
                orgRole={org?.role}
                onChanged={() => qc.invalidateQueries({ queryKey: ["staff-caseload", orgId, staffId] })}
              />
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
        </TabsContent>


        {/* ----- CERTS & TRAININGS ----- */}
        <TabsContent value="requirements" className="mt-4 space-y-10">
          <SectionGroup label="Certifications & training" hint="Current status and history">
            <SectionPanel icon={GraduationCap} accent="amber">
              <CertsTab organizationId={orgId} staffId={staffId} staffName={name} caseload={caseloadQ.data ?? []} orgRole={org?.role} />
            </SectionPanel>
          </SectionGroup>
        </TabsContent>

        {/* ----- COMPLIANCE CHECKLIST (full per-staff HR checklist) ----- */}
        <TabsContent value="checklist" className="mt-4 space-y-10">
          <SectionGroup label="HR Compliance Checklist" hint="Full per-staff requirements — evidence, sign-off, attestation, training hours">
            <SectionPanel icon={ClipboardList} accent="emerald">
              <StaffHrChecklistCard
                organizationId={orgId}
                staffId={staffId}
                view="checklist"
                filter="all"
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
        </TabsContent>

        {/* ----- HR DOCS ----- */}
        <TabsContent value="hrdocs" className="mt-4 space-y-10">
          <SectionGroup label="Sensitive HR" hint="Restricted access">
            <SectionPanel icon={Lock} accent="rose">
              <HrSensitiveCard
                orgId={orgId}
                staffId={staffId}
                isSelf={isSelf}
                orgRole={org?.role}
              />
            </SectionPanel>
          </SectionGroup>
          <SectionGroup label="HR documents" hint="Signed & uploaded files" divider>
            <SectionPanel icon={FolderArchive} accent="violet">
              <StaffHrDocsPanel organizationId={orgId} staffId={staffId} />
            </SectionPanel>
          </SectionGroup>
        </TabsContent>

        {/* ----- DEADLINES ----- */}
        <TabsContent value="deadlines" className="mt-4 space-y-10">
          <SectionGroup label="Deadlines" hint="Renewals & acknowledgements">
            <SectionPanel icon={CalendarClock} accent="amber">
              <Card>
                <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Staff-scoped deadlines (training expirations, cert renewals, scheduled-shift
                  acknowledgements) are tracked centrally on the deadlines desk.
                  {" "}
                  <Link to="/dashboard/deadlines" className="underline">Open deadlines →</Link>
                </CardContent>
              </Card>
            </SectionPanel>
          </SectionGroup>
        </TabsContent>
      </Tabs>
    </div>
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
  const [draft, setDraft] = useState({
    phone: "",
    employee_id: "",
    department: "",
    worker_type: "w2_employee",
    hire_date: "",
    emergency_contact_name: "",
    emergency_contact_relationship: "",
    emergency_contact_phone: "",
  });

  const startEdit = () => {
    setDraft({
      phone: p?.phone ?? "",
      employee_id: p?.employee_id ?? "",
      department: p?.department ?? "",
      worker_type: p?.worker_type ?? "w2_employee",
      hire_date: p?.hire_date ?? "",
      emergency_contact_name: p?.emergency_contact_name ?? "",
      emergency_contact_relationship: p?.emergency_contact_relationship ?? "",
      emergency_contact_phone: p?.emergency_contact_phone ?? "",
    });
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          phone: draft.phone || null,
          employee_id: draft.employee_id || null,
          department: draft.department || null,
          worker_type: draft.worker_type || null,
          hire_date: draft.hire_date || null,
          emergency_contact_name: draft.emergency_contact_name || null,
          emergency_contact_relationship: draft.emergency_contact_relationship || null,
          emergency_contact_phone: draft.emergency_contact_phone || null,
        } as any)
        .eq("id", staffId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Saved");
      setEditing(false);
      onSaved();
    },
    onError: (e) => toast.error((e as Error).message),
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
            <Row label="Email" value={p?.email ?? "—"} />
            <Row label="Phone" value={p?.phone ?? "—"} />
            <Row label="Employee ID" value={p?.employee_id ?? "—"} />
            <Row label="Position" value={positions.length ? positions.join(", ") : "—"} />
            <Row label="Worker type" value={p?.worker_type === "1099" ? "1099 contractor" : "W-2 employee"} />
            <Row label="Status" value={m.active ? "Active" : "Deactivated"} />
            <Row label="Department" value={p?.department ?? "—"} />
            <Row label="Hire date" value={p?.hire_date ?? "—"} />
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
                  <SelectItem value="w2_employee">W-2 employee</SelectItem>
                  <SelectItem value="1099">1099 contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Hire date</Label>
              <Input
                type="date"
                value={draft.hire_date}
                onChange={(e) => setDraft({ ...draft, hire_date: e.target.value })}
                className="text-sm"
              />
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
 * Caseload card — list of assigned clients with add/remove controls.
 * ====================================================================*/
function CaseloadCard({ orgId, staffId, caseload, allClients, orgRole, onChanged }: {
  orgId: string;
  staffId: string;
  caseload: Array<{ id: string; name: string; is_gh: boolean; codes: string[] }>;
  allClients: Array<{ id: string; first_name: string | null; last_name: string | null }>;
  orgRole: string | undefined;
  onChanged: () => void;
}) {
  const canEdit = orgRole === "admin" || orgRole === "manager";
  const [adding, setAdding] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [availableCodes, setAvailableCodes] = useState<string[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(false);
  const [saving, setSaving] = useState(false);

  const assignedIds = new Set(caseload.map((c) => c.id));
  const unassignedClients = allClients.filter((c) => !assignedIds.has(c.id));

  const onClientChange = async (clientId: string) => {
    setSelectedClientId(clientId);
    setSelectedCodes([]);
    setAvailableCodes([]);
    if (!clientId) return;
    setLoadingCodes(true);
    try {
      const { data } = await supabase
        .from("client_billing_codes")
        .select("service_code")
        .eq("client_id", clientId)
        .eq("organization_id", orgId);
      setAvailableCodes((data ?? []).map((r) => r.service_code));
    } finally {
      setLoadingCodes(false);
    }
  };

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const saveAdd = async () => {
    if (!selectedClientId || selectedCodes.length === 0) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("staff_assignments" as any).insert({
        organization_id: orgId,
        staff_id: staffId,
        client_id: selectedClientId,
        service_codes: selectedCodes,
        is_group_home_assignment: false,
      } as any);
      if (error) throw error;
      toast.success("Client added to caseload");
      setAdding(false);
      setSelectedClientId("");
      setSelectedCodes([]);
      setAvailableCodes([]);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add client");
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async (clientId: string, clientName: string) => {
    if (!window.confirm(`Remove ${clientName} from caseload?`)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("staff_assignments" as any) as any)
        .delete()
        .eq("staff_id", staffId)
        .eq("client_id", clientId)
        .eq("organization_id", orgId);
      if (error) throw error;
      toast.success("Removed from caseload");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove client");
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Caseload</CardTitle>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
            aria-label="Add client to caseload"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {caseload.length === 0 && !adding && (
          <p className="text-muted-foreground">No clients assigned.</p>
        )}
        {caseload.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 border-b border-border/30 py-2 last:border-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{c.name}</span>
              {c.codes.length > 0
                ? c.codes.map((code) => (
                    <Badge key={code} variant="secondary" className="text-[10px]">{code}</Badge>
                  ))
                : <Badge variant="outline" className="text-[10px] text-muted-foreground">No code</Badge>
              }
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => removeClient(c.id, c.name)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}

        {adding && (
          <div className="mt-3 space-y-3 rounded-lg border border-border/60 p-3">
            <div>
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Client</label>
              <Select value={selectedClientId} onValueChange={onClientChange}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="Select a client…" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedClients.length === 0
                    ? <SelectItem value="_none" disabled>All clients already assigned</SelectItem>
                    : unassignedClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {`${c.last_name ?? ""}, ${c.first_name ?? ""}`.trim().replace(/^,\s*/, "")}
                        </SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && (
              <div>
                <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Job code(s)</label>
                {loadingCodes ? (
                  <p className="mt-1 text-xs text-muted-foreground">Loading codes…</p>
                ) : availableCodes.length === 0 ? (
                  <p className="mt-1 text-xs text-amber-700">No billing codes on file for this client. Add them on the client profile first.</p>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {availableCodes.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => toggleCode(code)}
                        className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                          selectedCodes.includes(code)
                            ? "border-[#137182] bg-[#137182] text-white"
                            : "border-border text-muted-foreground hover:border-[#137182]"
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={saveAdd}
                disabled={saving || !selectedClientId || selectedCodes.length === 0}
              >
                {saving ? "Saving…" : "Add to caseload"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setSelectedClientId("");
                  setSelectedCodes([]);
                  setAvailableCodes([]);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
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

/* ======================================================================
 * Certs & Trainings tab — summary stats, filter chips, audit panel,
 * flat cert list, and client-specific training section.
 * ====================================================================*/
function CertSection({
  title, count, total, hasAction, actionCount, defaultOpen, children,
}: {
  title: string; count?: number; total?: number;
  hasAction: boolean; actionCount?: number;
  defaultOpen: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-border pb-1 pt-2 text-left"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
          {hasAction && actionCount ? (
            <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">{actionCount} need{actionCount === 1 ? "s" : ""} action</span>
          ) : null}
        </span>
        {typeof count === "number" ? (
          <span className="text-[11px] text-muted-foreground">
            {typeof total === "number" ? `${count} of ${total}` : `${count}${title === "Client-specific training" ? " clients" : ""}`}
          </span>
        ) : null}
      </button>
      {open && <div className="space-y-2 pt-2">{children}</div>}
    </div>
  );
}

function CertsTab({
  organizationId,
  staffId,
  staffName,
  caseload,
  orgRole,
}: {
  organizationId: string;
  staffId: string;
  staffName: string;
  caseload: Array<{ id: string; name: string; is_gh: boolean; codes: string[] }>;
  orgRole: string | undefined;
}) {
  const fetchChecklist = useServerFn(getStaffChecklist);
  const fetchPii = useServerFn(getStaffPii);
  const attachBaselineFn = useServerFn(attachBaselineCertificate);
  const setBaselineExpFn = useServerFn(setBaselineExpiration);
  const signOffBaselineFn = useServerFn(adminSignOffBaselineCompletion);
  const revokeBaselineFn = useServerFn(revokeBaselineSignOff);
  const createUpload = useServerFn(createHrDocumentUploadUrl);
  const getDocUrl = useServerFn(getHrDocumentUrl);
  const upsertChecklistFn = useServerFn(upsertChecklistCompletion);
  const fetchAnnualHours = useServerFn(getStaffAnnualHoursDetail);
  const addHoursFn = useServerFn(addStaffHoursEntry);
  const delHoursFn = useServerFn(deleteStaffHoursEntry);
  const recordAttestationFn = useServerFn(recordAttestation);
  const listAttestationsFn = useServerFn(listAttestations);
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "action" | "current" | "na">("all");
  const [auditOpen, setAuditOpen] = useState(false);
  const [logHoursOpen, setLogHoursOpen] = useState(false);
  const [hoursDraft, setHoursDraft] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    hours: "",
    note: "",
  });
  const [attestedHours, setAttestedHours] = useState(false);

  const checklistQ = useQuery({
    queryKey: ["staff-checklist", organizationId, staffId],
    queryFn: () => fetchChecklist({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const piiQ = useQuery({
    queryKey: ["staff-pii", organizationId, staffId],
    queryFn: () => fetchPii({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const annualHoursQ = useQuery({
    queryKey: ["staff-annual-hours", organizationId, staffId],
    queryFn: () => fetchAnnualHours({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const attestationsQ = useQuery({
    enabled: !!organizationId && !!staffId,
    queryKey: ["attestations", organizationId, staffId],
    queryFn: () => listAttestationsFn({ data: { organization_id: organizationId, staff_id: staffId } }),
  });

  const invalidate = () => {
    checklistQ.refetch();
    piiQ.refetch();
  };

  const addHoursMutation = useMutation({
    mutationFn: async (requirementId: string) => {
      const hrs = Number(hoursDraft.hours);
      if (!Number.isFinite(hrs) || hrs <= 0) throw new Error("Enter hours > 0");
      await addHoursFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: requirementId,
          entry_date: hoursDraft.entry_date,
          hours: hrs,
          note: hoursDraft.note || null,
        },
      });
      await recordAttestationFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          subject_kind: "training_hours",
          subject_ref: requirementId,
          hr_document_id: null,
          attestation_text: "I verify that these training hours were completed as logged.",
        },
      });
    },
    onSuccess: () => {
      toast.success("Hours logged");
      setLogHoursOpen(false);
      setAttestedHours(false);
      setHoursDraft({ entry_date: new Date().toISOString().slice(0, 10), hours: "", note: "" });
      annualHoursQ.refetch();
      checklistQ.refetch();
      qc.invalidateQueries({ queryKey: ["attestations", organizationId, staffId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const delHoursMutation = useMutation({
    mutationFn: async (entryId: string) =>
      delHoursFn({ data: { organization_id: organizationId, entry_id: entryId } }),
    onSuccess: () => {
      toast.success("Entry removed");
      annualHoursQ.refetch();
      checklistQ.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const todayMs = Date.now();
  const in60Ms = todayMs + 60 * 86400_000;

  type StatusKind = "current" | "expiring" | "overdue" | "todo" | "na";

  function rowStatusKind(row: NonNullable<typeof checklistQ.data>[number]): StatusKind {
    if (row.applicable === false) return "na";
    const status = row.completion.status;
    const expMs = row.completion.expires_at ? new Date(row.completion.expires_at).getTime() : null;
    const isExpired = status === "expired" || (expMs !== null && expMs < todayMs);
    const isSoon = expMs !== null && expMs >= todayMs && expMs <= in60Ms;
    if (status === "complete" && !isExpired) {
      return isSoon ? "expiring" : "current";
    }
    if (isExpired) return "overdue";
    if (isSoon) return "expiring";
    return "todo";
  }

  const allRows = checklistQ.data ?? [];

  const REQUIRED_BASELINE_KEYS = [
    "thirty_day",
    "cpr_first_aid",
    "annual_12h",
    "deescalation",
  ] as const;

  const BASELINE_DUPLICATE_TITLES_LC = new Set([
    "cpr & first aid",
    "cpr certification",
    "first aid certification",
    "person-centered thinking",
    "person-centered thinking & practices",
    "person centered thinking",
  ]);

  const ALLOWED_OTHER_CATEGORIES = new Set([
    "Background & Eligibility (Upon Hire)",
    "Employment Documents (Upon Hire)",
  ]);

  const baselineRows = REQUIRED_BASELINE_KEYS.map((key) =>
    allRows.find((r) => r.requirement_id === `baseline:${key}`) ?? null,
  );

  const baselineIds = new Set(REQUIRED_BASELINE_KEYS.map((k) => `baseline:${k}`));
  const otherRows = allRows.filter(
    (r) =>
      !baselineIds.has(r.requirement_id) &&
      !BASELINE_DUPLICATE_TITLES_LC.has(r.title.trim().toLowerCase()),
  );

  const counts = useMemo(() => {
    const c = { current: 0, expiring: 0, overdue: 0, todo: 0 };
    const visibleRows = [
      ...baselineRows.filter(Boolean),
      ...otherRows.filter((r) => ALLOWED_OTHER_CATEGORIES.has(r.category ?? "")),
    ];
    for (const row of visibleRows) {
      if (!row || row.applicable === false) continue;
      const kind = rowStatusKind(row);
      if (kind === "current") c.current++;
      else if (kind === "expiring") c.expiring++;
      else if (kind === "overdue") c.overdue++;
      else c.todo++;
    }
    return c;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistQ.data]);

  const needsActionCount = counts.overdue + counts.expiring + counts.todo;

  function passesFilter(row: NonNullable<typeof checklistQ.data>[number]): boolean {
    if (filter === "all") return true;
    const kind = rowStatusKind(row);
    if (filter === "action") return kind !== "current" && kind !== "na";
    if (filter === "current") return kind === "current";
    if (filter === "na") return kind === "na";
    return true;
  }

  function dotColor(kind: StatusKind): string {
    if (kind === "current") return "bg-emerald-500";
    if (kind === "expiring") return "bg-amber-500";
    if (kind === "overdue") return "bg-rose-500";
    if (kind === "na") return "bg-transparent border-2 border-muted-foreground/40";
    return "bg-rose-500";
  }

  function expDateColor(kind: StatusKind): string {
    if (kind === "overdue") return "text-rose-600 font-medium";
    if (kind === "expiring") return "text-amber-700 font-medium";
    return "text-muted-foreground";
  }

  const otherByCategory = new Map<string, typeof otherRows>();
  for (const r of otherRows) {
    const cat = r.category ?? "Other";
    if (!otherByCategory.has(cat)) otherByCategory.set(cat, []);
    otherByCategory.get(cat)!.push(r);
  }

  // Audit CSV export.
  const exportAudit = () => {
    const cols = ["Requirement", "SOW ref", "Status", "Completed", "Expires"];
    const rows = allRows.map((r) => {
      const kind = rowStatusKind(r);
      const label = kind === "current" ? "Current" : kind === "expiring" ? "Expiring" : kind === "overdue" ? "Overdue" : kind === "na" ? "N/A" : "To do";
      const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [r.title, r.source_citation ?? "—", label, r.completion.completed_date ?? "—", r.completion.expires_at ?? "—"].map(esc).join(",");
    });
    const csv = [cols.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cert-audit-${staffId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (checklistQ.isLoading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading checklist…</div>;
  }

  const canEdit = orgRole === "admin" || orgRole === "manager";

  return (
    <div className="space-y-4">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Current" value={counts.current} tone="emerald" />
        <SummaryStat label="Expiring soon" value={counts.expiring} tone="amber" />
        <SummaryStat label="Overdue" value={counts.overdue} tone="rose" />
        <SummaryStat label="To do" value={counts.todo} tone="muted" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
          <FilterChip active={filter === "action"} onClick={() => setFilter("action")}>
            Needs action ({needsActionCount})
          </FilterChip>
          <FilterChip active={filter === "current"} onClick={() => setFilter("current")}>
            Current ({counts.current})
          </FilterChip>
          <FilterChip active={filter === "na"} onClick={() => setFilter("na")}>N/A</FilterChip>
        </div>
        <button
          type="button"
          onClick={() => setAuditOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#137182] px-3 py-1.5 text-xs text-[#137182] hover:bg-[#E1F5EE]"
        >
          <Download className="h-3.5 w-3.5" /> Audit report
        </button>
      </div>

      {/* Audit panel */}
      {auditOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Cert &amp; training audit</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={exportAudit}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <FileText className="h-3 w-3" /> Export CSV
              </button>
              <button
                type="button"
                onClick={() => setAuditOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Requirement</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">SOW ref</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Completed</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Expires</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((r) => {
                  const kind = rowStatusKind(r);
                  return (
                    <tr key={r.requirement_id} className="border-b border-border/40 last:border-0">
                      <td className="py-1.5 pr-3">{r.title}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.source_citation ?? "—"}</td>
                      <td className="py-1.5 pr-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          kind === "current" ? "bg-emerald-100 text-emerald-800" :
                          kind === "expiring" ? "bg-amber-100 text-amber-800" :
                          kind === "overdue" ? "bg-rose-100 text-rose-800" :
                          kind === "na" ? "bg-muted text-muted-foreground" :
                          "bg-rose-100 text-rose-800"
                        }`}>
                          {kind === "current" ? "Current" : kind === "expiring" ? "Expiring" : kind === "overdue" ? "Overdue" : kind === "na" ? "N/A" : "To do"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{r.completion.completed_date ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{r.completion.expires_at ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            CPR &amp; First Aid satisfies both the training (SOW 1.8(4)) and certification (SOW 1.8(5)(A)(B)) requirements — one upload covers both.
          </p>
        </div>
      )}

      {/* Required trainings section */}
      {(() => {
        const reqActionCount = baselineRows.filter((r) => r && ["overdue", "expiring", "todo"].includes(rowStatusKind(r))).length;
        const reqCurrent = baselineRows.filter((r) => r && rowStatusKind(r) === "current").length;
        return (
          <CertSection
            title="Required trainings (SOW §1.8)"
            count={reqCurrent}
            total={REQUIRED_BASELINE_KEYS.length}
            hasAction={reqActionCount > 0}
            actionCount={reqActionCount}
            defaultOpen={reqActionCount > 0}
          >
      <div>

        {REQUIRED_BASELINE_KEYS.map((key, i) => {
          const row = baselineRows[i];

          // Derive display info by key (not from raw row titles).
          const metaByKey: Record<string, { meta: string; title: string }> = {
            thirty_day: {
              title: "30-Day Training",
              meta: "Due within 30 days of hire · Renews every 12 mo",
            },
            cpr_first_aid: {
              title: "CPR & First Aid",
              meta: "Due within 90 days of hire · Renews every 24 mo · Satisfies SOW 1.8(4) training and 1.8(5)(A)(B) cert — one upload covers both",
            },
            annual_12h: {
              title: "Ongoing Training",
              meta: "12 hours required per year · Admin can log sessions anytime",
            },
            deescalation: {
              title: "Behavior De-escalation",
              meta: "MANDT, SOAR, CPI, PART, or Safety Care · Due within 180 days of trigger · Renews every 12 mo",
            },
          };

          const display = metaByKey[key];
          if (!row) {
            // Row not yet in checklist (edge case — always show placeholder).
            if (!passesFilter({ applicable: true, completion: { status: "not_started", expires_at: null, completed_date: null }, requirement_id: `baseline:${key}` } as any)) return null;
            return (
              <div key={key} className="flex items-start gap-3 border-b border-border/30 py-3 last:border-0">
                <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{display.title}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{display.meta}</div>
                </div>
                <span className="text-[11px] text-rose-600 font-medium">Overdue</span>
              </div>
            );
          }

          const kind = rowStatusKind(row);
          if (!passesFilter(row)) return null;

          // De-escalation: special handling when not triggered.
          const isDeescalation = key === "deescalation";
          const notTriggered = isDeescalation && row.applicable === false;
          const notTriggeredMeta = notTriggered ? ` · Not triggered — no behavior-coded client currently assigned` : "";

          const isAnnual12h = key === "annual_12h";
          const annualDetail = isAnnual12h ? ((annualHoursQ.data ?? [])[0] ?? null) : null;

          return (
            <div key={key} className="flex items-start gap-3 border-b border-border/30 py-3 last:border-0">
              <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dotColor(notTriggered ? "na" : kind)}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm">{display.title}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {display.meta}{isDeescalation ? notTriggeredMeta : ""}
                </div>
                {isAnnual12h && annualHoursQ.isLoading && (
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading hours…
                  </div>
                )}
                {isAnnual12h && annualDetail && (
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="text-sm font-medium">
                        {annualDetail.hours_to_date} / {annualDetail.target_hours} hrs
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full ${
                            annualDetail.status === "complete" || annualDetail.status === "on_target"
                              ? "bg-emerald-500"
                              : annualDetail.status === "behind"
                                ? "bg-amber-500"
                                : "bg-muted-foreground/40"
                          }`}
                          style={{
                            width: `${Math.min(100, Math.round((annualDetail.hours_to_date / Math.max(1, annualDetail.target_hours)) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {annualDetail.window_start && annualDetail.window_end
                          ? `Window: ${annualDetail.window_start} → ${annualDetail.window_end} · training ${annualDetail.training_hours} hr · manual ${annualDetail.manual_hours} hr`
                          : "No employment-year window — hire date missing."}
                      </div>
                    </div>
                    {annualDetail.entries.length > 0 && (
                      <ul className="space-y-1 text-xs">
                        {annualDetail.entries.map((e) => (
                          <li key={e.id} className="flex items-center justify-between rounded-md border border-border/40 px-2 py-1">
                            <div className="min-w-0">
                              <span className="font-medium">{e.hours} hr</span>
                              <span className="ml-2 text-muted-foreground">{e.entry_date}</span>
                              {e.note && <span className="ml-2 text-muted-foreground">· {e.note}</span>}
                            </div>
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  if (confirm("Remove this entry?")) delHoursMutation.mutate(e.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canEdit && !logHoursOpen && (
                      <Button size="sm" variant="outline" onClick={() => setLogHoursOpen(true)}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Log hours
                      </Button>
                    )}
                    {canEdit && logHoursOpen && (
                      <div className="grid gap-2 rounded-md border border-border/60 p-2 sm:grid-cols-4">
                        <div>
                          <Label className="text-[11px]">Date</Label>
                          <Input
                            type="date"
                            value={hoursDraft.entry_date}
                            onChange={(e) => setHoursDraft({ ...hoursDraft, entry_date: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-[11px]">Hours</Label>
                          <Input
                            type="number"
                            step="0.25"
                            min="0.25"
                            max="24"
                            value={hoursDraft.hours}
                            onChange={(e) => setHoursDraft({ ...hoursDraft, hours: e.target.value })}
                            placeholder="1.5"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label className="text-[11px]">Note</Label>
                          <Input
                            value={hoursDraft.note}
                            onChange={(e) => setHoursDraft({ ...hoursDraft, note: e.target.value })}
                            placeholder="What was the training?"
                          />
                        </div>
                        <div className="sm:col-span-4 space-y-2">
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={attestedHours}
                              onChange={(e) => setAttestedHours(e.target.checked)}
                              className="rounded"
                            />
                            I verify these hours were completed as logged.
                          </label>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => addHoursMutation.mutate(annualDetail.config.requirement_id)}
                              disabled={addHoursMutation.isPending || !attestedHours}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setLogHoursOpen(false)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {!notTriggered && (
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  {row.completion.expires_at && (
                    <span className={`text-[11px] ${expDateColor(kind)}`}>
                      {kind === "overdue" ? "Overdue" : `Exp ${row.completion.expires_at}`}
                    </span>
                  )}
                  {!row.completion.expires_at && kind === "overdue" && (
                    <span className="text-[11px] text-rose-600 font-medium">Overdue</span>
                  )}
                  <CertBaselineAction
                    organizationId={organizationId}
                    staffId={staffId}
                    trainingKey={key}
                    currentEvidenceDocId={row.completion.evidence_document_id}
                    nectarValidationStatus={row.completion.nectar_validation_status}
                    onChanged={invalidate}
                    attachBaselineFn={attachBaselineFn}
                    createUpload={createUpload}
                    getDocUrl={getDocUrl}
                  />
                  {!!row.completion.evidence_document_id && row.completion.nectar_validation_status !== "failed" && (
                    <AttestationGate
                      organizationId={organizationId}
                      staffId={staffId}
                      subjectKind="baseline_cert"
                      subjectRef={key}
                      hrDocumentId={row.completion.evidence_document_id}
                      statement="I verify that the information on this document is accurate and current, and that this individual has met this requirement."
                      attested={(attestationsQ.data ?? []).some((a: { subject_kind: string; subject_ref: string }) => a.subject_kind === "baseline_cert" && a.subject_ref === key)}
                      onAttested={async () => {
                        attestationsQ.refetch();
                        try { await signOffBaselineFn({ data: { organization_id: organizationId, staff_id: staffId, training_key: key } }); } catch (_) {}
                        invalidate();
                      }}
                    />
                  )}
                </div>
              )}
              {notTriggered && (
                <span className="text-[11px] text-muted-foreground pt-0.5">Not triggered</span>
              )}
            </div>
          );
        })}
      </div>
          </CertSection>
        );
      })()}

      {/* Other rows by category */}
      {Array.from(otherByCategory.entries())
        .filter(([cat]) => ALLOWED_OTHER_CATEGORIES.has(cat))
        .map(([cat, items]) => {
        const visibleItems = items.filter(passesFilter);
        if (visibleItems.length === 0) return null;
        const completedCount = items.filter((r) => rowStatusKind(r) === "current").length;
        const catActionCount = items.filter((r) => ["overdue", "expiring", "todo"].includes(rowStatusKind(r))).length;
        return (
          <CertSection
            key={cat}
            title={cat}
            count={completedCount}
            total={items.length}
            hasAction={catActionCount > 0}
            actionCount={catActionCount}
            defaultOpen={catActionCount > 0}
          >
            {visibleItems.map((row) => {
              const kind = rowStatusKind(row);
              const bKey = parseBaselineId(row.requirement_id);
              return (
                <div key={row.requirement_id} className="flex items-start gap-3 border-b border-border/30 py-3 last:border-0">
                  <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${dotColor(kind)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{row.title}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {row.is_renewable && row.renewal_interval_months && `Renews every ${row.renewal_interval_months} mo`}
                      {row.source_citation && ` · ${row.source_citation}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                    {row.completion.expires_at && (
                      <span className={`text-[11px] ${expDateColor(kind)}`}>
                        {kind === "overdue" ? "Overdue" : `Exp ${row.completion.expires_at}`}
                      </span>
                    )}
                    {!row.completion.expires_at && kind === "overdue" && (
                      <span className="text-[11px] text-rose-600 font-medium">Overdue</span>
                    )}
                    {row.applicable !== false && bKey && (
                      <CertBaselineAction
                        organizationId={organizationId}
                        staffId={staffId}
                        trainingKey={bKey}
                        currentEvidenceDocId={row.completion.evidence_document_id}
                        nectarValidationStatus={row.completion.nectar_validation_status}
                        onChanged={invalidate}
                        attachBaselineFn={attachBaselineFn}
                        createUpload={createUpload}
                        getDocUrl={getDocUrl}
                      />
                    )}
                    {row.applicable !== false && !bKey && (
                      <DocUploadAction
                        organizationId={organizationId}
                        staffId={staffId}
                        requirementId={row.requirement_id}
                        currentEvidenceDocId={row.completion.evidence_document_id}
                        onChanged={invalidate}
                        createUpload={createUpload}
                        getDocUrl={getDocUrl}
                        upsertChecklistFn={upsertChecklistFn}
                      />
                    )}
                    {row.applicable !== false && !!row.completion.evidence_document_id && row.completion.nectar_validation_status !== "failed" && (
                      <AttestationGate
                        organizationId={organizationId}
                        staffId={staffId}
                        subjectKind="checklist_doc"
                        subjectRef={row.requirement_id}
                        hrDocumentId={row.completion.evidence_document_id}
                        statement="I verify that the information on this document is accurate and current, and that this individual has met this requirement."
                        attested={(attestationsQ.data ?? []).some((a: { subject_kind: string; subject_ref: string }) => a.subject_kind === "checklist_doc" && a.subject_ref === row.requirement_id)}
                        onAttested={() => { attestationsQ.refetch(); invalidate(); }}
                      />
                    )}
                    {row.applicable === false && (
                      <span className="text-[11px] text-muted-foreground">N/A</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CertSection>
        );
      })}

      {/* Client-specific training */}
      {caseload.length > 0 && (
        <CertSection
          title="Client-specific training"
          count={caseload.length}
          hasAction={false}
          defaultOpen={false}
        >
          {caseload.map((client) => (
            <ClientTrainingCard
              key={client.id}
              client={client}
              organizationId={organizationId}
              staffId={staffId}
              staffName={staffName}
            />
          ))}
        </CertSection>
      )}
    </div>
  );
}

/* ======================================================================
 * Simplified baseline cert action buttons (upload / view / replace).
 * ====================================================================*/
function CertBaselineAction({
  organizationId,
  staffId,
  trainingKey,
  currentEvidenceDocId,
  nectarValidationStatus,
  onChanged,
  attachBaselineFn,
  createUpload,
  getDocUrl,
}: {
  organizationId: string;
  staffId: string;
  trainingKey: string;
  currentEvidenceDocId: string | null;
  nectarValidationStatus: string | null;
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attachBaselineFn: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createUpload: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocUrl: any;
}) {
  const [working, setWorking] = useState(false);
  const hasCert = !!currentEvidenceDocId;
  const validationFailed = nectarValidationStatus === "failed";

  const handleUpload = async (file: File) => {
    try {
      setWorking(true);
      const r = await createUpload({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: null,
          document_kind: `baseline:${trainingKey}`,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      const up = await fetch(r.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      const att = await attachBaselineFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          training_key: trainingKey,
          hr_document_id: r.hr_document_id,
          run_ocr: true,
        },
      });
      if (att?.validation_status === "failed") {
        const reasons: string[] = Array.isArray(att?.reasons) ? att.reasons : [];
        toast.error(`Nectar rejected: ${reasons.join(", ") || "Unknown reason"}`, { duration: 8000 });
      } else {
        toast.success("Certificate uploaded — awaiting admin sign-off");
      }
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handleView = async () => {
    if (!currentEvidenceDocId) return;
    try {
      const r = await getDocUrl({
        data: { organization_id: organizationId, hr_document_id: currentEvidenceDocId },
      });
      window.open(r.signed_url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (hasCert && !validationFailed) {
    return (
      <button
        type="button"
        onClick={handleView}
        className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-transparent px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50"
      >
        <Eye className="h-3 w-3" /> View cert
      </button>
    );
  }

  return (
    <label
      className={`relative z-0 inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-muted ${
        validationFailed
          ? "border-rose-300 text-rose-700 hover:bg-rose-50"
          : "border-border/60 text-muted-foreground"
      } ${working ? "opacity-50 pointer-events-none" : ""}`}
      title={validationFailed ? "Nectar rejected this cert — upload a replacement" : "Upload certificate (PDF, image, or document)"}
    >
      <Upload className="h-3 w-3" />
      <span>{validationFailed ? "Replace cert" : hasCert ? "Replace" : "Upload"}</span>
      <input
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.csv,.xls,.xlsx,image/*,application/pdf"
        disabled={working}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          await handleUpload(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

/* ======================================================================
 * Doc upload action for non-cert checklist rows (Background & Eligibility,
 * Employment Documents). Uploads the file, links it onto the staff's
 * checklist completion as the evidence document, then offers "View document".
 * ====================================================================*/
function DocUploadAction({
  organizationId,
  staffId,
  requirementId,
  currentEvidenceDocId,
  onChanged,
  createUpload,
  getDocUrl,
  upsertChecklistFn,
}: {
  organizationId: string;
  staffId: string;
  requirementId: string;
  currentEvidenceDocId: string | null;
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createUpload: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocUrl: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertChecklistFn: any;
}) {
  const [working, setWorking] = useState(false);
  const hasDoc = !!currentEvidenceDocId;

  const handleUpload = async (file: File) => {
    try {
      setWorking(true);
      const r = await createUpload({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: requirementId,
          document_kind: `checklist_doc:${requirementId}`,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        },
      });
      const up = await fetch(r.upload.signed_url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!up.ok) throw new Error(`Upload failed (${up.status})`);
      await upsertChecklistFn({
        data: {
          organization_id: organizationId,
          staff_id: staffId,
          requirement_id: requirementId,
          status: "complete",
          completed_date: new Date().toISOString().slice(0, 10),
          evidence_document_id: r.hr_document_id,
        },
      });
      toast.success("Document uploaded");
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const handleView = async () => {
    if (!currentEvidenceDocId) return;
    try {
      const r = await getDocUrl({
        data: { organization_id: organizationId, hr_document_id: currentEvidenceDocId },
      });
      window.open(r.signed_url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {hasDoc && (
        <button
          type="button"
          onClick={handleView}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-transparent px-2 py-1 text-[11px] text-emerald-700 hover:bg-emerald-50"
        >
          <Eye className="h-3 w-3" /> View document
        </button>
      )}
      <label
        className={`relative z-0 inline-flex cursor-pointer items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted ${
          working ? "opacity-50 pointer-events-none" : ""
        }`}
        title={hasDoc ? "Replace document" : "Upload document (PDF, image, or document)"}
      >
        <Upload className="h-3 w-3" />
        <span>{hasDoc ? "Replace" : "Upload document"}</span>
        <input
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx,.csv,.xls,.xlsx,image/*,application/pdf"
          disabled={working}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            await handleUpload(f);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

/* ======================================================================
 * AttestationGate — admin attests a document or training hours entry.
 * ====================================================================*/
function AttestationGate({
  organizationId, staffId, subjectKind, subjectRef, hrDocumentId, statement, attested, onAttested,
}: {
  organizationId: string;
  staffId: string;
  subjectKind: "baseline_cert" | "checklist_doc" | "training_hours";
  subjectRef: string;
  hrDocumentId: string | null;
  statement: string;
  attested: boolean;
  onAttested: () => void;
}) {
  const recordFn = useServerFn(recordAttestation);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  if (attested) {
    return <span className="text-[11px] text-emerald-700">Attested ✓</span>;
  }
  const attest = async () => {
    setSaving(true);
    try {
      await recordFn({ data: {
        organization_id: organizationId, staff_id: staffId,
        subject_kind: subjectKind, subject_ref: subjectRef,
        hr_document_id: hrDocumentId, attestation_text: statement,
      }});
      toast.success("Attested");
      setOpen(false);
      onAttested();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return open ? (
    <div className="flex flex-col items-end gap-1">
      <span className="max-w-[220px] text-right text-[10px] text-muted-foreground">{statement}</span>
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-[11px]" disabled={saving} onClick={attest}>Confirm</Button>
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  ) : (
    <button type="button" onClick={() => setOpen(true)} className="text-[11px] text-primary underline">Attest</button>
  );
}

/* ======================================================================
 * Client-specific training collapsible card.
 * ====================================================================*/
function ClientTrainingCard({
  client,
  organizationId,
  staffId,
  staffName,
}: {
  client: { id: string; name: string; codes: string[] };
  organizationId: string;
  staffId: string;
  staffName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [openCert, setOpenCert] = useState<TrainingCertificateRecord | null>(null);

  const trainingsQ = useQuery({
    enabled: open,
    queryKey: ["client-specific-trainings", organizationId, client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_specific_trainings")
        .select("id, title, status, approved_at, updated_at, training_type")
        .eq("organization_id", organizationId)
        .eq("client_id", client.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const completionsQ = useQuery({
    enabled: open,
    queryKey: ["client-training-completions", staffId, client.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_completions")
        .select(
          "id, ref_id, topic_title, topic_code, completed_at, attestation_statement, consent_statement, typed_signature, signer_full_name, signer_email, content_version, content_hash, time_zone, ip_address, user_agent, consent_accepted, question_answers, content_snapshot",
        )
        .eq("user_id", staffId)
        .eq("topic_kind", "person")
        .eq("is_current", true)
        .order("completed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const completions = (completionsQ.data ?? []) as unknown as TrainingCertificateRecord[];
  function findCompletionFor(t: { id: string; training_type?: string }): TrainingCertificateRecord | undefined {
    const exact = completions.find((c) => (c as { ref_id?: string }).ref_id === t.id);
    if (exact) return exact;
    return completions.find((c) => {
      const snap = (c as { content_snapshot?: { training_type?: string; client_id?: string } }).content_snapshot;
      return !!snap && snap.training_type === t.training_type && snap.client_id === client.id;
    });
  }

  const initials = client.name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const primaryCode = client.codes[0];

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E1F5EE] text-[11px] font-medium text-[#0F6E56]">
            {initials}
          </span>
          <span className="text-sm font-medium">{client.name}</span>
          {primaryCode && (
            <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
              {primaryCode}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-3 pt-1">
          {trainingsQ.isLoading ? (
            <p className="py-3 text-xs text-muted-foreground">Loading…</p>
          ) : (trainingsQ.data ?? []).length === 0 ? (
            <p className="py-3 text-xs text-muted-foreground">
              No client-specific training on file. Add via client profile.
            </p>
          ) : (
            <ul className="divide-y divide-border/40">
              {(trainingsQ.data ?? []).map((t) => {
                const isApproved = t.status === "approved" || t.status === "published";
                const completion = findCompletionFor(t);
                return (
                  <li key={t.id} className="flex items-center gap-2 py-2 text-xs">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${isApproved ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="flex-1">{(t as { training_type?: string }).training_type === "person_centered" ? "Person-Centered Thinking" : t.title}</span>
                    <span className="text-muted-foreground">
                      {isApproved && t.approved_at
                        ? `Approved ${new Date(t.approved_at).toLocaleDateString()}`
                        : t.status}
                    </span>
                    {completion && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setOpenCert(completion)}
                      >
                        <FileSignature className="mr-1 h-3 w-3" /> View certificate
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <TrainingCertificateDialog
        open={!!openCert}
        onOpenChange={(v) => !v && setOpenCert(null)}
        record={openCert}
        staffId={staffId}
        staffName={staffName}
      />
    </div>
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

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "rose" | "muted" }) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : tone === "rose"
          ? "text-rose-700"
          : "text-muted-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>{value}</div>
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

// ── Employee record completeness bar ──────────────────────────────────────
// Mirrors the client Profile tab's RecordCompletenessBar: a compact progress
// bar showing "X of Y required complete / N missing", expandable to the row
// list. All checks read profile fields that already load in memberQ — no new
// data fetches, purely presentational.
type StaffReq = {
  key: string;
  title: string;
  sub: string;
  ok: boolean;
};
function StaffRecordCompletenessBar({
  photoPath, email, phone, employeeId, hireDate, teamId,
  staffTypeCount, emergencyName, emergencyPhone, positionsCount,
}: {
  photoPath: string | null;
  email: string | null;
  phone: string | null;
  employeeId: string | null;
  hireDate: string | null;
  teamId: string | null;
  staffTypeCount: number;
  emergencyName: string | null;
  emergencyPhone: string | null;
  positionsCount: number;
}) {
  const [open, setOpen] = useState(false);
  const reqs: StaffReq[] = [
    { key: "photo", title: "Profile photo", sub: "Used on scheduler & coverage", ok: !!photoPath },
    { key: "email", title: "Work email", sub: "Login & notifications", ok: !!email },
    { key: "phone", title: "Phone number", sub: "Reachable for shifts", ok: !!phone },
    { key: "employee_id", title: "Employee ID", sub: "Internal roster identifier", ok: !!(employeeId && employeeId.trim()) },
    { key: "hire_date", title: "Hire date", sub: "Anchors tenure & renewals", ok: !!hireDate },
    { key: "position", title: "Position / role", sub: "Job title on record", ok: positionsCount > 0 },
    { key: "team", title: "Team assignment", sub: "Home or workgroup", ok: !!teamId },
    { key: "staff_types", title: "Staff type(s)", sub: "Drives required trainings", ok: staffTypeCount > 0 },
    { key: "emergency", title: "Emergency contact", sub: "Name + phone on file", ok: !!(emergencyName && emergencyPhone) },
  ];
  const completed = reqs.filter((r) => r.ok).length;
  const required = reqs.length;
  const missing = required - completed;
  const pct = Math.round((completed / required) * 100);
  const allDone = missing === 0;

  return (
    <Card>
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-3 text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Record</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${allDone ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {allDone ? "Record complete" : `${completed} of ${required} required complete`}
          </span>
          {!allDone ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {missing} missing
            </span>
          ) : null}
          {open ? <ChevronDown className="h-4 w-4 rotate-180 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {open ? (
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Required fields</div>
            {reqs.map((r) => (
              <div key={r.key} className="flex items-center gap-3 py-1.5">
                <div
                  className={
                    "h-6 w-6 rounded grid place-items-center text-xs font-bold flex-none " +
                    (r.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")
                  }
                >
                  {r.ok ? "✓" : "!"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.sub}</div>
                </div>
                <span className={"text-xs " + (r.ok ? "text-emerald-700" : "text-amber-700")}>
                  {r.ok ? "On file" : "Missing"}
                </span>
              </div>
            ))}
          </div>
        ) : null}
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
