import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Plus, Send, Trash2, User, Contact2, Calendar, Building2, ShieldCheck, ExternalLink,
  AlertTriangle, Eye, Settings, UserPlus, Mail,
} from "lucide-react";
import { FeatureGate } from "@/components/upgrade-gate";
import { useCurrentOrg } from "@/hooks/use-org";
import { toast } from "sonner";
import { AuditorPackagePreview } from "@/components/audit-portal/auditor-package-preview";
import {
  listOrgAuditPackages,
  createAuditPackage,
  getPackageBuilderDetail,
  listOrgSubjectCandidates,
  addPackageSubject,
  removePackageSubject,
  releaseAuditPackage,
  grantAuditorAccess,
  revokeAuditorAccess,
  listOrgAuditors,
  provisionOrgAuditor,
  revokeOrgAuditor,
  type AuditPackageRow,
  type OrgAuditorRow,
} from "@/lib/audit-portal.functions";


export const Route = createFileRoute("/dashboard/state-audit")({
  head: () => ({ meta: [{ title: "State Audit Packages — HIVE" }] }),
  component: () => (
    <FeatureGate featureKey="state_audit">
      <StateAuditPage />
    </FeatureGate>
  ),
});

function StateAuditPage() {
  const { data: org } = useCurrentOrg();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"admin" | "auditor-view">("admin");

  if (!org) return <div className="p-6 text-sm text-muted-foreground">Loading organization…</div>;

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-[#fed7aa] bg-gradient-to-r from-[#fff7ed] to-[#ffedd5] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-wider text-[#9a3412]">State Audit</div>
              <h1 className="font-display text-xl font-bold text-[#0f1b3d]">Audit Packages</h1>
              <p className="text-xs text-[#9a3412]">
                Assemble packets of subject-level records, provision auditors, and preview
                exactly what they see at{" "}
                <a href="/audit-portal" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-medium underline">
                  the State Audit Portal <ExternalLink className="h-3 w-3" />
                </a>.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-white/60 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          Auditor views currently render synthetic seed data. Real subject records
          will flow through this same interface once HIVE's compliant host + BAA are
          in effect.
        </div>
      </header>

      {/* Sub-tabs: Admin View / Auditor View */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        <SubTabButton active={tab === "admin"} onClick={() => setTab("admin")} icon={<Settings className="h-3.5 w-3.5" />}>
          Admin View
        </SubTabButton>
        <SubTabButton active={tab === "auditor-view"} onClick={() => setTab("auditor-view")} icon={<Eye className="h-3.5 w-3.5" />}>
          Auditor View
        </SubTabButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <PackageList orgId={org.organization_id} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="space-y-4">
          {tab === "admin" ? (
            selectedId ? (
              <PackageDetail packageId={selectedId} orgId={org.organization_id} />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-muted-foreground">
                Select or create an audit package to begin.
              </div>
            )
          ) : selectedId ? (
            <AuditorPackagePreview packageId={selectedId} mode="org" />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-muted-foreground">
              Select a package to preview the auditor view.
            </div>
          )}

          {/* Auditor provisioning always visible in Admin View, org-wide */}
          {tab === "admin" && <ProvisionedAuditorsSection orgId={org.organization_id} />}
        </div>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
        active ? "bg-[#0f1b3d] text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {icon} {children}
    </button>
  );
}


// ============================================================
// Package list + create
// ============================================================

function PackageList({ orgId, selectedId, onSelect }: {
  orgId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgAuditPackages);
  const createFn = useServerFn(createAuditPackage);
  const listQ = useQuery({
    queryKey: ["state-audit-packages", orgId],
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const [showForm, setShowForm] = useState(false);

  const createMut = useMutation({
    mutationFn: (v: { stateAgency: string; title: string; dateRangeStart: string; dateRangeEnd: string }) =>
      createFn({ data: { organizationId: orgId, ...v } }),
    onSuccess: (r) => {
      toast.success("Draft package created");
      qc.invalidateQueries({ queryKey: ["state-audit-packages", orgId] });
      onSelect(r.id);
      setShowForm(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => setShowForm((s) => !s)}
        className="inline-flex w-full min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-[#0f1b3d] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1a2a5a]"
      >
        <Plus className="h-4 w-4" /> New audit package
      </button>

      {showForm && <CreateForm onSubmit={(v) => createMut.mutate(v)} busy={createMut.isPending} />}

      <ul className="space-y-2">
        {listQ.isLoading ? (
          <li className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-muted-foreground">Loading…</li>
        ) : (listQ.data ?? []).length === 0 ? (
          <li className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs text-muted-foreground">
            No packages yet.
          </li>
        ) : (
          (listQ.data ?? []).map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedId === p.id
                    ? "border-[#0f1b3d] bg-[#0f1b3d]/5"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="truncate text-sm font-medium text-[#0f1b3d]">
                    {p.title ?? p.state_agency}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.date_range_start} → {p.date_range_end}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {p.subject_count} subjects · {p.auditor_count} auditor{p.auditor_count === 1 ? "" : "s"}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function CreateForm({ onSubmit, busy }: {
  onSubmit: (v: { stateAgency: string; title: string; dateRangeStart: string; dateRangeEnd: string }) => void;
  busy: boolean;
}) {
  const [stateAgency, setStateAgency] = useState("Utah DSPD");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ stateAgency, title, dateRangeStart: start, dateRangeEnd: end });
      }}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
    >
      <label className="block text-xs font-medium text-muted-foreground">
        State agency
        <input value={stateAgency} onChange={(e) => setStateAgency(e.target.value)} required
          className="mt-1 min-h-[40px] w-full rounded-md border border-slate-300 px-2 text-sm" />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Title (optional)
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          className="mt-1 min-h-[40px] w-full rounded-md border border-slate-300 px-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-medium text-muted-foreground">
          Start date
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required
            className="mt-1 min-h-[40px] w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          End date
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required
            className="mt-1 min-h-[40px] w-full rounded-md border border-slate-300 px-2 text-sm" />
        </label>
      </div>
      <button type="submit" disabled={busy}
        className="min-h-[40px] w-full rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
        {busy ? "Creating…" : "Create draft"}
      </button>
    </form>
  );
}

function StatusPill({ status }: { status: AuditPackageRow["status"] }) {
  const map = {
    draft: "bg-slate-100 text-slate-700",
    released: "bg-emerald-100 text-emerald-700",
    closed: "bg-gray-200 text-gray-600",
  }[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${map}`}>{status}</span>;
}

// ============================================================
// Package detail: subjects + auditors + release
// ============================================================

function PackageDetail({ packageId, orgId }: { packageId: string; orgId: string }) {
  const qc = useQueryClient();
  const detailFn = useServerFn(getPackageBuilderDetail);
  const candidatesFn = useServerFn(listOrgSubjectCandidates);
  const addFn = useServerFn(addPackageSubject);
  const removeFn = useServerFn(removePackageSubject);
  const releaseFn = useServerFn(releaseAuditPackage);
  const grantFn = useServerFn(grantAuditorAccess);
  const revokeFn = useServerFn(revokeAuditorAccess);

  const detailQ = useQuery({
    queryKey: ["state-audit-package-detail", packageId],
    queryFn: () => detailFn({ data: { auditPackageId: packageId } }),
  });
  const candidatesQ = useQuery({
    queryKey: ["state-audit-candidates", orgId],
    queryFn: () => candidatesFn({ data: { organizationId: orgId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["state-audit-package-detail", packageId] });
    qc.invalidateQueries({ queryKey: ["state-audit-packages", orgId] });
  };

  const addMut = useMutation({
    mutationFn: (v: { subjectType: "staff" | "client"; subjectId: string; subjectLabel: string }) =>
      addFn({ data: { auditPackageId: packageId, ...v } }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { subjectRowId: id } }),
    onSuccess: () => invalidate(),
  });
  const releaseMut = useMutation({
    mutationFn: () => releaseFn({ data: { auditPackageId: packageId } }),
    onSuccess: () => { toast.success("Package released"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const grantMut = useMutation({
    mutationFn: (auditorAccountId: string) =>
      grantFn({ data: { auditPackageId: packageId, auditorAccountId } }),
    onSuccess: () => { toast.success("Auditor granted access"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const revokeMut = useMutation({
    mutationFn: (accessRowId: string) => revokeFn({ data: { accessRowId } }),
    onSuccess: () => { toast.success("Access revoked"); invalidate(); },
  });

  if (detailQ.isLoading) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-muted-foreground">Loading package…</div>;
  if (!detailQ.data) return <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">Package not found.</div>;

  const { package: pkg, subjects, access, availableAuditors } = detailQ.data;
  const activeAccess = access.filter((a) => !a.revoked_at);
  const isDraft = pkg.status === "draft";

  const usedSubjectIds = new Set(subjects.map((s) => `${s.subject_type}:${s.subject_id}`));
  const usedAuditorIds = new Set(activeAccess.map((a) => a.auditor_account_id));

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <StatusPill status={pkg.status} />
              <h3 className="font-display text-lg font-semibold text-[#0f1b3d]">
                {pkg.title ?? pkg.state_agency}
              </h3>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {pkg.state_agency}</span>
              <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {pkg.date_range_start} → {pkg.date_range_end}</span>
              <span>{subjects.length} subjects · {activeAccess.length} auditor{activeAccess.length === 1 ? "" : "s"}</span>
            </div>
          </div>
          {isDraft && (
            <button
              onClick={() => releaseMut.mutate()}
              disabled={releaseMut.isPending || subjects.length === 0 || activeAccess.length === 0}
              title={subjects.length === 0 ? "Add subjects first" : activeAccess.length === 0 ? "Grant at least one auditor first" : ""}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Release to auditors
            </button>
          )}
        </div>
      </section>

      {/* Subjects */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 font-display text-sm font-semibold text-[#0f1b3d]">Subjects in scope</h4>
        {subjects.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-muted-foreground">
            No subjects added yet.
          </div>
        ) : (
          <ul className="mb-3 space-y-1">
            {subjects.map((s) => {
              const Icon = s.subject_type === "staff" ? User : Contact2;
              return (
                <li key={s.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm">
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-xs uppercase text-muted-foreground">{s.subject_type}</span>
                    <span>{s.subject_label ?? s.subject_id.slice(0, 8)}</span>
                  </span>
                  {isDraft && (
                    <button onClick={() => removeMut.mutate(s.id)} className="text-xs text-red-600 hover:text-red-800">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {isDraft && candidatesQ.data && (
          <div className="grid gap-3 md:grid-cols-2">
            <SubjectPicker
              title="Add staff"
              items={candidatesQ.data.staff.filter((c) => !usedSubjectIds.has(`staff:${c.id}`))}
              onAdd={(c) => addMut.mutate({ subjectType: "staff", subjectId: c.id, subjectLabel: c.label })}
            />
            <SubjectPicker
              title="Add clients"
              items={candidatesQ.data.clients.filter((c) => !usedSubjectIds.has(`client:${c.id}`))}
              onAdd={(c) => addMut.mutate({ subjectType: "client", subjectId: c.id, subjectLabel: c.label })}
            />
          </div>
        )}
      </section>

      {/* Auditors */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 font-display text-sm font-semibold text-[#0f1b3d]">Auditors with access</h4>
        {access.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-xs text-muted-foreground">
            No auditors granted access yet.
          </div>
        ) : (
          <ul className="mb-3 space-y-1">
            {access.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-sm">
                <div>
                  <div className="font-medium text-[#0f1b3d]">{a.auditor_name}</div>
                  <div className="text-xs text-muted-foreground">{a.auditor_email} · {a.auditor_agency}</div>
                </div>
                {a.revoked_at ? (
                  <span className="text-xs text-muted-foreground">Revoked</span>
                ) : (
                  <button
                    onClick={() => revokeMut.mutate(a.id)}
                    className="text-xs font-medium text-red-600 hover:text-red-800"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <AuditorGrantPicker
          available={availableAuditors.filter((a) => !usedAuditorIds.has(a.id))}
          onGrant={(id) => grantMut.mutate(id)}
        />
      </section>

      <div className="text-center">
        <Link to="/audit-portal" target="_blank" rel="noopener"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[#0f1b3d]">
          Preview auditor portal <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function SubjectPicker({ title, items, onAdd }: {
  title: string;
  items: Array<{ id: string; label: string }>;
  onAdd: (item: { id: string; label: string }) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  return (
    <div className="rounded-md border border-slate-200 p-2">
      <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
        className="mb-2 min-h-[36px] w-full rounded border border-slate-300 px-2 text-xs" />
      <ul className="max-h-40 space-y-0.5 overflow-y-auto">
        {filtered.map((i) => (
          <li key={i.id}>
            <button onClick={() => onAdd(i)}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-slate-100">
              <span className="truncate">{i.label}</span>
              <Plus className="h-3 w-3 text-emerald-600" />
            </button>
          </li>
        ))}
        {filtered.length === 0 && <li className="px-2 py-1 text-xs italic text-slate-400">No matches.</li>}
      </ul>
    </div>
  );
}

function AuditorGrantPicker({ available, onGrant }: {
  available: Array<{ id: string; email: string; full_name: string; agency_name: string }>;
  onGrant: (id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="flex gap-2">
      <select value={selected} onChange={(e) => setSelected(e.target.value)}
        className="min-h-[40px] flex-1 rounded-md border border-slate-300 px-2 text-sm">
        <option value="">Select auditor to grant access…</option>
        {available.map((a) => (
          <option key={a.id} value={a.id}>
            {a.full_name} ({a.agency_name}) — {a.email}
          </option>
        ))}
      </select>
      <button
        onClick={() => { if (selected) { onGrant(selected); setSelected(""); } }}
        disabled={!selected}
        className="inline-flex min-h-[40px] items-center gap-1 rounded-md bg-[#0f1b3d] px-3 text-sm font-semibold text-white hover:bg-[#1a2a5a] disabled:opacity-50"
      >
        <Plus className="h-4 w-4" /> Grant
      </button>
    </div>
  );
}
