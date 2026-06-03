import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Save, Upload, FileText, CheckCircle2, Building2, Plus, Trash2,
  MapPin, Sparkles, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStateTemplate,
  updateStateTemplateSection,
  publishStateTemplate,
  updatePlatformStateBasics,
  listPlatformStates,
} from "@/lib/state-templates.functions";
import {
  listStateRequirementSources,
  createStateRequirementSource,
  deleteStateRequirementSource,
  listStateProviders,
} from "@/lib/state-requirements.functions";
import type {
  StateBillingCode, StateRequiredDoc, StateForm, StateTrainingMandate,
} from "@/lib/state-templates";
import { STATE_INVENTORY, INVENTORY_AREAS, type InventoryItem } from "@/lib/state-inventory";
import { listStructuralGaps, fileStructuralGap, updateStructuralGap } from "@/lib/state-structural-gaps.functions";


export const Route = createFileRoute("/dashboard/hive-exec/states/$stateCode")({
  head: ({ params }) => ({ meta: [{ title: `${params.stateCode} — State Profile` }] }),
  component: StateDetailPage,
});

const STATUS_OPTIONS: Array<{ value: "coming_soon" | "draft" | "active"; label: string }> = [
  { value: "coming_soon", label: "Coming soon" },
  { value: "draft", label: "In development" },
  { value: "active", label: "Live" },
];

function StateDetailPage() {
  const { stateCode } = Route.useParams();
  const [tab, setTab] = useState<"profile" | "inventory" | "sources" | "providers">("profile");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.endsWith("/onboarding")) return <Outlet />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Link
          to="/dashboard/hive-exec/states"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All states
        </Link>
        <h2 className="font-display text-lg font-semibold">{stateCode} — State Profile</h2>
        <Link
          to="/dashboard/hive-exec/states/$stateCode/onboarding"
          params={{ stateCode }}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a]"
        >
          <Sparkles className="h-3.5 w-3.5" /> Run state onboarding
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {(
          [
            ["profile", "Profile & Template"],
            ["inventory", "Inventory & Gaps"],
            ["sources", "Authoritative Sources"],
            ["providers", "Providers"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex min-h-[36px] items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors ${
              tab === key ? "bg-[#0f1b3d] text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "profile" ? <ProfileTab stateCode={stateCode} /> : null}
      {tab === "inventory" ? <InventoryTab stateCode={stateCode} /> : null}
      {tab === "sources" ? <SourcesTab stateCode={stateCode} /> : null}
      {tab === "providers" ? <ProvidersTab stateCode={stateCode} /> : null}

    </div>
  );
}

// ═══ PROFILE TAB ═════════════════════════════════════════════════════════════

function ProfileTab({ stateCode }: { stateCode: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStateTemplate);
  const saveFn = useServerFn(updateStateTemplateSection);
  const publishFn = useServerFn(publishStateTemplate);
  const listStatesFn = useServerFn(listPlatformStates);

  const stateQ = useQuery({
    queryKey: ["platform-states"],
    queryFn: () => listStatesFn(),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stateRow = (stateQ.data ?? []).find((s: any) => s.code === stateCode) as
    | { code: string; name: string; status: string; regulator_label: string | null; notes: string | null; provider_count: number; is_reference: boolean }
    | undefined;

  const tplQ = useQuery({
    queryKey: ["state-template", stateCode],
    queryFn: () => getFn({ data: { stateCode } }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = (tplQ.data ?? null) as any;
  const hasTemplate = !!tpl;

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { stateCode } }),
    onSuccess: () => {
      toast.success("State template published — providers in this state will inherit it.");
      qc.invalidateQueries({ queryKey: ["state-template", stateCode] });
      qc.invalidateQueries({ queryKey: ["platform-states"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveSection = async (section: string, value: unknown) => {
    await saveFn({ data: { stateCode, section: section as never, value: value as never } });
    qc.invalidateQueries({ queryKey: ["state-template", stateCode] });
  };

  return (
    <div className="space-y-4">
      <BasicsCard stateCode={stateCode} row={stateRow} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3 text-sm">
        <div className="text-muted-foreground">
          {tpl?.published_at
            ? <>Template published {new Date(tpl.published_at).toLocaleString()} · v{tpl.version}</>
            : hasTemplate
              ? <>Unpublished draft — providers read the last published version.</>
              : <>No template yet — start configuring sections below, then publish.</>}
        </div>
        <button
          onClick={() => publish.mutate()}
          disabled={publish.isPending || !hasTemplate}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#b8631a] disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {publish.isPending ? "Publishing…" : "Publish template"}
        </button>
      </div>

      {tplQ.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Loading template…
        </div>
      ) : !hasTemplate && !stateRow?.is_reference ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto mb-2 h-6 w-6 opacity-60" />
          No template yet — fill in any section below to start. Utah is the reference implementation.
        </div>
      ) : null}

      <TerminologyEditor value={tpl?.terminology ?? {}} onSave={(v) => saveSection("terminology", v)} />
      <BillingCodesEditor value={tpl?.billing_codes ?? { codes: [] }} onSave={(v) => saveSection("billing_codes", v)} />
      <FormsEditor value={tpl?.forms ?? { forms: [] }} onSave={(v) => saveSection("forms", v)} />
      <TrainingEditor value={tpl?.training ?? { mandates: [] }} onSave={(v) => saveSection("training", v)} />
      <EvvEditor value={tpl?.evv ?? {}} onSave={(v) => saveSection("evv", v)} />
      <RequiredDocsEditor value={tpl?.required_documents ?? { docs: [] }} onSave={(v) => saveSection("required_documents", v)} />
      <DepartmentStructureEditor value={tpl?.department_structure ?? { agency_types: [], program_levels: [] }} onSave={(v) => saveSection("department_structure", v)} />

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs text-amber-900">
        <div className="mb-1 inline-flex items-center gap-1 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Can't be configured?
        </div>
        Use <Link to="/dashboard/hive-exec/states/$stateCode/onboarding" params={{ stateCode }} className="font-semibold underline">state onboarding</Link> to flag structural gaps — those open NECTAR tickets for the platform team instead of silently failing.
      </div>
    </div>
  );
}

// ─── Basics ──────────────────────────────────────────────────────────────────

function BasicsCard({
  stateCode,
  row,
}: {
  stateCode: string;
  row: { code: string; name: string; status: string; regulator_label: string | null; notes: string | null; provider_count: number; is_reference: boolean } | undefined;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updatePlatformStateBasics);

  const [status, setStatus] = useState<string>(row?.status ?? "coming_soon");
  const [regulator, setRegulator] = useState<string>(row?.regulator_label ?? "");
  const [notes, setNotes] = useState<string>(row?.notes ?? "");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!row) return;
    setStatus(row.status);
    setRegulator(row.regulator_label ?? "");
    setNotes(row.notes ?? "");
    setDirty(false);
  }, [row]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          code: stateCode,
          status: status as "draft" | "active" | "coming_soon",
          regulator_label: regulator.trim() || null,
          notes: notes.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("State basics saved.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["platform-states"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 font-display text-sm font-semibold">
          <MapPin className="h-4 w-4 text-[#d97a1c]" />
          {row?.name ?? stateCode} {row?.is_reference ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">Reference</span> : null}
        </h3>
        <span className="text-xs text-muted-foreground">
          {row?.provider_count ?? 0} provider{(row?.provider_count ?? 0) === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setDirty(true); }}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field label="Regulating department / agency">
          <input
            value={regulator}
            placeholder="e.g. DSPD"
            onChange={(e) => { setRegulator(e.target.value); setDirty(true); }}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        </Field>
        <Field label="Provider count">
          <div className="inline-flex min-h-[40px] items-center gap-1 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
            <Building2 className="h-3.5 w-3.5" /> {row?.provider_count ?? 0}
          </div>
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Notes">
          <textarea
            value={notes}
            rows={2}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            placeholder="Anything HIVE Executives should know about this state's setup."
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3 w-3" /> {save.isPending ? "Saving…" : "Save basics"}
        </button>
      </div>
    </section>
  );
}

// ─── Generic section shell ───────────────────────────────────────────────────

function SectionShell({
  title, dirty, saving, onSave, children,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3 w-3" /> {saving ? "Saving…" : "Save"}
        </button>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function useSectionState<T>(initial: T, onSave: (v: T) => Promise<void>) {
  const initialMemo = useMemo(() => initial, [JSON.stringify(initial)]);
  const [value, setValue] = useState<T>(initialMemo);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setValue(initialMemo); setDirty(false); }, [initialMemo]);
  const [saving, setSaving] = useState(false);
  const update = (next: T) => { setValue(next); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try { await onSave(value); toast.success("Saved."); setDirty(false); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return { value, update, save, dirty, saving };
}

// ─── Terminology ─────────────────────────────────────────────────────────────

function TerminologyEditor({ value, onSave }: { value: { department_name?: string; regulator?: string; role_labels?: Record<string, string>; service_labels?: Record<string, string> }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState(
    {
      department_name: value.department_name ?? "",
      regulator: value.regulator ?? "",
      role_labels: value.role_labels ?? {},
      service_labels: value.service_labels ?? {},
    },
    onSave,
  );

  return (
    <SectionShell title="Terminology" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Department / division name">
          <input
            value={s.value.department_name}
            onChange={(e) => s.update({ ...s.value, department_name: e.target.value })}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        </Field>
        <Field label="Regulator short name (e.g. DSPD)">
          <input
            value={s.value.regulator}
            onChange={(e) => s.update({ ...s.value, regulator: e.target.value })}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        </Field>
      </div>
      <KvEditor label="Role labels (e.g. direct_support → Direct Support Professional)"
        value={s.value.role_labels} onChange={(v) => s.update({ ...s.value, role_labels: v })} />
      <KvEditor label="Service labels (e.g. host_home → Host Home)"
        value={s.value.service_labels} onChange={(v) => s.update({ ...s.value, service_labels: v })} />
    </SectionShell>
  );
}

function KvEditor({ label, value, onChange }: { label: string; value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const entries = Object.entries(value ?? {});
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {entries.map(([k, v], i) => (
          <div key={i} className="flex gap-2">
            <input
              value={k}
              onChange={(e) => {
                const next = { ...value };
                delete next[k];
                next[e.target.value] = v;
                onChange(next);
              }}
              placeholder="key"
              className="min-h-[36px] w-40 rounded-md border border-border bg-background px-2 text-xs font-mono"
            />
            <input
              value={v}
              onChange={(e) => onChange({ ...value, [k]: e.target.value })}
              placeholder="label"
              className="min-h-[36px] flex-1 rounded-md border border-border bg-background px-2 text-xs"
            />
            <button
              onClick={() => { const n = { ...value }; delete n[k]; onChange(n); }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ ...value, "": "" })}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Add label
        </button>
      </div>
    </div>
  );
}

// ─── Billing codes ───────────────────────────────────────────────────────────

function BillingCodesEditor({ value, onSave }: { value: { codes?: StateBillingCode[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<{ codes: StateBillingCode[] }>(
    { codes: value.codes ?? [] }, onSave,
  );

  const update = (i: number, patch: Partial<StateBillingCode>) => {
    const next = [...s.value.codes];
    next[i] = { ...next[i], ...patch };
    s.update({ codes: next });
  };

  return (
    <SectionShell title="Service & Billing Codes" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Code</th>
              <th className="px-2 py-1 text-left">Service name</th>
              <th className="px-2 py-1 text-left">Unit type</th>
              <th className="px-2 py-1 text-center">EVV?</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.value.codes.length === 0 ? (
              <tr><td colSpan={5} className="px-2 py-3 text-center text-muted-foreground">No codes yet.</td></tr>
            ) : s.value.codes.map((c, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1"><input value={c.code} onChange={(e) => update(i, { code: e.target.value })} className="min-h-[36px] w-28 rounded-md border border-border bg-background px-2 font-mono text-xs" /></td>
                <td className="px-2 py-1"><input value={c.name} onChange={(e) => update(i, { name: e.target.value })} className="min-h-[36px] w-full rounded-md border border-border bg-background px-2 text-sm" /></td>
                <td className="px-2 py-1">
                  <select value={c.unit_type} onChange={(e) => update(i, { unit_type: e.target.value })} className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs">
                    <option value="15min">15min</option>
                    <option value="hourly">hourly</option>
                    <option value="daily">daily</option>
                  </select>
                </td>
                <td className="px-2 py-1 text-center">
                  <input type="checkbox" checked={!!c.evv_required} onChange={(e) => update(i, { evv_required: e.target.checked })} className="h-4 w-4" />
                </td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => s.update({ codes: s.value.codes.filter((_, x) => x !== i) })}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted" aria-label="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => s.update({ codes: [...s.value.codes, { code: "", name: "", unit_type: "15min", evv_required: true }] })}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add billing code
      </button>
    </SectionShell>
  );
}

// ─── Forms ───────────────────────────────────────────────────────────────────

function FormsEditor({ value, onSave }: { value: { forms?: StateForm[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<{ forms: StateForm[] }>({ forms: value.forms ?? [] }, onSave);

  const update = (i: number, patch: Partial<StateForm>) => {
    const next = [...s.value.forms];
    next[i] = { ...next[i], ...patch };
    s.update({ forms: next });
  };

  return (
    <SectionShell title="State Forms (520, 1056, PCSP equivalents)" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="space-y-2">
        {s.value.forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">No state forms yet.</p>
        ) : s.value.forms.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-12">
            <input value={f.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Form name" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm md:col-span-4" />
            <input value={f.slug} onChange={(e) => update(i, { slug: e.target.value })} placeholder="slug" className="min-h-[36px] rounded-md border border-border bg-background px-2 font-mono text-xs md:col-span-2" />
            <input value={f.cadence} onChange={(e) => update(i, { cadence: e.target.value })} placeholder="cadence" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2" />
            <input value={f.produced_by} onChange={(e) => update(i, { produced_by: e.target.value })} placeholder="produced by" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2" />
            <div className="flex gap-1 md:col-span-2">
              <input value={f.submission} onChange={(e) => update(i, { submission: e.target.value })} placeholder="submission" className="min-h-[36px] flex-1 rounded-md border border-border bg-background px-2 text-xs" />
              <button onClick={() => s.update({ forms: s.value.forms.filter((_, x) => x !== i) })}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted" aria-label="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => s.update({ forms: [...s.value.forms, { slug: "", name: "", cadence: "monthly", submission: "", produced_by: "platform" }] })}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add state form
      </button>
    </SectionShell>
  );
}

// ─── Training ────────────────────────────────────────────────────────────────

function TrainingEditor({ value, onSave }: { value: { mandates?: StateTrainingMandate[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<{ mandates: StateTrainingMandate[] }>({ mandates: value.mandates ?? [] }, onSave);

  const update = (i: number, patch: Partial<StateTrainingMandate>) => {
    const next = [...s.value.mandates];
    next[i] = { ...next[i], ...patch };
    s.update({ mandates: next });
  };

  return (
    <SectionShell title="Training Mandates" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="space-y-2">
        {s.value.mandates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No training mandates yet.</p>
        ) : s.value.mandates.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-12">
            <input value={m.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Training name" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm md:col-span-4" />
            <input value={m.slug} onChange={(e) => update(i, { slug: e.target.value })} placeholder="slug" className="min-h-[36px] rounded-md border border-border bg-background px-2 font-mono text-xs md:col-span-3" />
            <input
              type="number" min={0}
              value={m.cadence_months ?? ""}
              onChange={(e) => update(i, { cadence_months: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="months (blank = one-time)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2"
            />
            <input
              value={(m.roles ?? []).join(",")}
              onChange={(e) => update(i, { roles: e.target.value.split(",").map((r) => r.trim()).filter(Boolean) })}
              placeholder="roles (comma-sep)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2"
            />
            <button onClick={() => s.update({ mandates: s.value.mandates.filter((_, x) => x !== i) })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted md:col-span-1" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => s.update({ mandates: [...s.value.mandates, { slug: "", name: "", cadence_months: 12, roles: [] }] })}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add training mandate
      </button>
    </SectionShell>
  );
}

// ─── EVV ─────────────────────────────────────────────────────────────────────

function EvvEditor({ value, onSave }: { value: { default_geofence_feet?: number; variance_grace_minutes?: number; approved_locations_cap?: number; reconciliation_policy?: string; aggregator?: string }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState(
    {
      default_geofence_feet: value.default_geofence_feet ?? 500,
      variance_grace_minutes: value.variance_grace_minutes ?? 7,
      approved_locations_cap: value.approved_locations_cap ?? 5,
      aggregator: value.aggregator ?? "",
      reconciliation_policy: value.reconciliation_policy ?? "",
    },
    onSave,
  );

  return (
    <SectionShell title="EVV Configuration" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Geofence (ft)"><input type="number" min={0} value={s.value.default_geofence_feet} onChange={(e) => s.update({ ...s.value, default_geofence_feet: Number(e.target.value) })} className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" /></Field>
        <Field label="Grace minutes"><input type="number" min={0} value={s.value.variance_grace_minutes} onChange={(e) => s.update({ ...s.value, variance_grace_minutes: Number(e.target.value) })} className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" /></Field>
        <Field label="Approved locations cap"><input type="number" min={0} value={s.value.approved_locations_cap} onChange={(e) => s.update({ ...s.value, approved_locations_cap: Number(e.target.value) })} className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" /></Field>
        <Field label="State EVV aggregator"><input value={s.value.aggregator} placeholder="e.g. HHAeXchange" onChange={(e) => s.update({ ...s.value, aggregator: e.target.value })} className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" /></Field>
      </div>
      <div className="mt-3">
        <Field label="Reconciliation policy">
          <textarea value={s.value.reconciliation_policy} rows={2} onChange={(e) => s.update({ ...s.value, reconciliation_policy: e.target.value })} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
        </Field>
      </div>
    </SectionShell>
  );
}

// ─── Required documents ─────────────────────────────────────────────────────

function RequiredDocsEditor({ value, onSave }: { value: { docs?: StateRequiredDoc[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<{ docs: StateRequiredDoc[] }>({ docs: value.docs ?? [] }, onSave);

  const update = (i: number, patch: Partial<StateRequiredDoc>) => {
    const next = [...s.value.docs];
    next[i] = { ...next[i], ...patch };
    s.update({ docs: next });
  };

  return (
    <SectionShell title="Required Documents (recurring attestations)" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="space-y-2">
        {s.value.docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No required documents yet.</p>
        ) : s.value.docs.map((d, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-12">
            <input value={d.name} onChange={(e) => update(i, { name: e.target.value })} placeholder="Document name" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm md:col-span-5" />
            <input value={d.slug} onChange={(e) => update(i, { slug: e.target.value })} placeholder="slug" className="min-h-[36px] rounded-md border border-border bg-background px-2 font-mono text-xs md:col-span-3" />
            <input value={d.cadence} onChange={(e) => update(i, { cadence: e.target.value })} placeholder="cadence" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2" />
            <input value={d.attestor} onChange={(e) => update(i, { attestor: e.target.value })} placeholder="attestor" className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-1" />
            <button onClick={() => s.update({ docs: s.value.docs.filter((_, x) => x !== i) })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted md:col-span-1" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => s.update({ docs: [...s.value.docs, { slug: "", name: "", cadence: "annual", attestor: "admin" }] })}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add required document
      </button>
    </SectionShell>
  );
}

// ─── Department structure ────────────────────────────────────────────────────

function DepartmentStructureEditor({ value, onSave }: { value: { agency_types?: string[]; program_levels?: string[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState(
    { agency_types: value.agency_types ?? [], program_levels: value.program_levels ?? [] },
    onSave,
  );

  return (
    <SectionShell title="Department Structure & Jurisdiction" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="grid gap-4 md:grid-cols-2">
        <StringListEditor label="Agency / provider types" value={s.value.agency_types} onChange={(v) => s.update({ ...s.value, agency_types: v })} placeholder="e.g. Supported Living" />
        <StringListEditor label="Program / service levels" value={s.value.program_levels} onChange={(v) => s.update({ ...s.value, program_levels: v })} placeholder="e.g. Level 3" />
      </div>
    </SectionShell>
  );
}

function StringListEditor({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {(value ?? []).map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={v}
              onChange={(e) => { const next = [...value]; next[i] = e.target.value; onChange(next); }}
              placeholder={placeholder}
              className="min-h-[36px] flex-1 rounded-md border border-border bg-background px-2 text-xs"
            />
            <button onClick={() => onChange(value.filter((_, x) => x !== i))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...(value ?? []), ""])}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-dashed border-border px-2 text-xs text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}

// ═══ SOURCES TAB ═════════════════════════════════════════════════════════════

function SourcesTab({ stateCode }: { stateCode: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStateRequirementSources);
  const addFn = useServerFn(createStateRequirementSource);
  const delFn = useServerFn(deleteStateRequirementSource);

  const q = useQuery({
    queryKey: ["state-req-sources", stateCode],
    queryFn: () => listFn({ data: { stateCode } }),
  });

  const [title, setTitle] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");

  const add = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          stateCode,
          title,
          jurisdiction: jurisdiction || null,
          source_type: "authoritative",
        },
      }),
    onSuccess: () => {
      toast.success("Source added — NECTAR will parse on next run.");
      setTitle("");
      setJurisdiction("");
      qc.invalidateQueries({ queryKey: ["state-req-sources", stateCode] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state-req-sources", stateCode] }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (q.data ?? []) as any[];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4" /> Add authoritative source
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          State SOW / contract / requirement docs. NECTAR parses them to form the state's requirement baseline (Prompt 47).
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <input placeholder="Title (e.g. DSPD Provider Code)" value={title} onChange={(e) => setTitle(e.target.value)} className="min-h-[40px] rounded-md border border-border bg-background px-3 text-sm md:col-span-2" />
          <input placeholder="Jurisdiction (optional)" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} className="min-h-[40px] rounded-md border border-border bg-background px-3 text-sm" />
          <button onClick={() => add.mutate()} disabled={!title.trim() || add.isPending}
            className="min-h-[40px] rounded-md bg-[#d97a1c] px-3 text-sm font-semibold text-white hover:bg-[#b8631a] disabled:opacity-50 md:col-span-3">
            {add.isPending ? "Adding…" : "Add source"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" /> Sources
        </h3>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.jurisdiction ?? "—"} · status: {r.parse_status} · derived: {r.derived_count}
                  </div>
                </div>
                <button onClick={() => remove.mutate(r.id)} className="text-xs text-[#b91c1c] hover:underline">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ═══ PROVIDERS TAB ═══════════════════════════════════════════════════════════

function ProvidersTab({ stateCode }: { stateCode: string }) {
  const fn = useServerFn(listStateProviders);
  const q = useQuery({
    queryKey: ["state-providers", stateCode],
    queryFn: () => fn({ data: { stateCode } }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (q.data ?? []) as any[];

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold">
        <Building2 className="h-4 w-4" /> Providers in {stateCode}
      </h3>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No providers in this state yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2 text-sm">
              <Link to="/dashboard/hive-exec/$orgId" params={{ orgId: o.id }} className="font-medium hover:underline">
                {o.name}
              </Link>
              <span className="text-xs text-muted-foreground">
                Joined {new Date(o.created_at).toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
