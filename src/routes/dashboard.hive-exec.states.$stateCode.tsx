import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Save, Upload, FileText, CheckCircle2, Building2, Plus, Trash2,
  MapPin, Sparkles, AlertTriangle, ListChecks, Gauge, BookOpen, Scale,
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
  previewStateBaseUpgrade,
  upgradeStateToBaseVersion,
} from "@/lib/state-base-versions.functions";

import {
  listStateRequirementSources,
  createStateRequirementSource,
  deleteStateRequirementSource,
  listStateProviders,
} from "@/lib/state-requirements.functions";
import type {
  StateBillingCode, StateRequiredDoc, StateForm, StateTrainingMandate,
  StateCitation, StateCapsSection, StateRegulatorSection,
} from "@/lib/state-templates";
import { TEMPLATE_SECTIONS } from "@/lib/state-templates";
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

      {tab === "profile" ? <ProfileTab stateCode={stateCode} onJumpToSources={() => setTab("sources")} /> : null}
      {tab === "inventory" ? <InventoryTab stateCode={stateCode} /> : null}
      {tab === "sources" ? <SourcesTab stateCode={stateCode} /> : null}
      {tab === "providers" ? <ProvidersTab stateCode={stateCode} /> : null}

    </div>
  );
}

// ═══ PROFILE TAB ═════════════════════════════════════════════════════════════

function ProfileTab({ stateCode, onJumpToSources }: { stateCode: string; onJumpToSources?: () => void }) {
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

      <BaseVersionBanner stateCode={stateCode} />

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

      <TemplateSectionNav />

      <TerminologyEditor value={tpl?.terminology ?? {}} onSave={(v) => saveSection("terminology", v)} />
      <RegulatorEditor value={tpl?.regulator ?? {}} onSave={(v) => saveSection("regulator", v)} />
      <BillingCodesEditor value={tpl?.billing_codes ?? { codes: [] }} onSave={(v) => saveSection("billing_codes", v)} />
      <FormsEditor value={tpl?.forms ?? { forms: [] }} onSave={(v) => saveSection("forms", v)} />
      <TrainingEditor value={tpl?.training ?? { mandates: [] }} onSave={(v) => saveSection("training", v)} />
      <EvvEditor value={tpl?.evv ?? {}} onSave={(v) => saveSection("evv", v)} />
      <CapsEditor value={tpl?.caps ?? {}} onSave={(v) => saveSection("caps", v)} />
      <CitationsEditor value={tpl?.citations ?? { sections: [] }} onSave={(v) => saveSection("citations", v)} />
      <RequiredDocsEditor value={tpl?.required_documents ?? { docs: [] }} onSave={(v) => saveSection("required_documents", v)} />
      <DepartmentStructureEditor value={tpl?.department_structure ?? { agency_types: [], program_levels: [] }} onSave={(v) => saveSection("department_structure", v)} />

      <div id="sources-pointer" className="scroll-mt-24 rounded-xl border border-sky-200 bg-sky-50/50 p-4 text-xs text-sky-900">
        <div className="mb-1 inline-flex items-center gap-1 font-semibold">
          <Upload className="h-3.5 w-3.5" /> Upload state-specific documents
        </div>
        Provider contract, billing manual, EVV policy, code book — upload authoritative sources on the{" "}
        <button onClick={() => onJumpToSources?.()} className="font-semibold underline">
          Authoritative Sources
        </button>{" "}
        tab. NECTAR parses uploads into per-state requirements with source attribution.
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-xs text-amber-900">
        <div className="mb-1 inline-flex items-center gap-1 font-semibold">
          <AlertTriangle className="h-3.5 w-3.5" /> Can't be configured?
        </div>
        Use <Link to="/dashboard/hive-exec/states/$stateCode/onboarding" params={{ stateCode }} className="font-semibold underline">state onboarding</Link> to flag structural gaps — those open NECTAR tickets for the platform team instead of silently failing.
      </div>
    </div>
  );
}

// ─── Section anchor nav ──────────────────────────────────────────────────────

function TemplateSectionNav() {
  return (
    <nav className="sticky top-2 z-10 -mx-1 flex flex-wrap gap-1 rounded-xl border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
      {TEMPLATE_SECTIONS.map((s) => (
        <a
          key={s.key}
          href={`#section-${s.key}`}
          className="inline-flex min-h-[32px] items-center rounded-md border border-transparent bg-muted/40 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-border hover:bg-background hover:text-foreground"
        >
          {s.label}
        </a>
      ))}
      <a
        href="#sources-pointer"
        className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
      >
        <Upload className="h-3 w-3" /> Documents
      </a>
    </nav>
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
  title, dirty, saving, onSave, children, id, blurb,
}: {
  title: string;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  children: React.ReactNode;
  id?: string;
  blurb?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-semibold">{title}</h3>
          {blurb ? <p className="mt-0.5 text-[11px] text-muted-foreground">{blurb}</p> : null}
        </div>
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3 w-3" /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
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
    <SectionShell id="section-terminology" title="Terminology" dirty={s.dirty} saving={s.saving} onSave={s.save}>
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
    <SectionShell id="section-billing_codes" title="Service & Billing Codes" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left">Code</th>
              <th className="px-2 py-1 text-left">Service name</th>
              <th className="px-2 py-1 text-left">Unit type</th>
              <th className="px-2 py-1 text-left">Std. rate ($)</th>
              <th className="px-2 py-1 text-center">EVV?</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {s.value.codes.length === 0 ? (
              <tr><td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">No codes yet.</td></tr>
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
                <td className="px-2 py-1">
                  <input
                    type="number" min={0} step="0.01" placeholder="—"
                    value={c.rate ?? ""}
                    onChange={(e) => update(i, { rate: e.target.value === "" ? null : Number(e.target.value) })}
                    className="min-h-[36px] w-24 rounded-md border border-border bg-background px-2 text-xs"
                  />
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
        onClick={() => s.update({ codes: [...s.value.codes, { code: "", name: "", unit_type: "15min", evv_required: true, rate: null }] })}
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
    <SectionShell id="section-forms" title="State Forms (520, 1056, PCSP equivalents)" dirty={s.dirty} saving={s.saving} onSave={s.save}>
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
    <SectionShell id="section-training" title="Training Mandates" dirty={s.dirty} saving={s.saving} onSave={s.save}>
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
    <SectionShell id="section-evv" title="EVV Configuration" dirty={s.dirty} saving={s.saving} onSave={s.save}>
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
    <SectionShell id="section-required_documents" title="Required Documents (recurring attestations)" dirty={s.dirty} saving={s.saving} onSave={s.save}>
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
    <SectionShell id="section-department_structure" title="Department Structure & Jurisdiction" dirty={s.dirty} saving={s.saving} onSave={s.save}>
      <div className="grid gap-4 md:grid-cols-2">
        <StringListEditor label="Agency / provider types" value={s.value.agency_types} onChange={(v) => s.update({ ...s.value, agency_types: v })} placeholder="e.g. Supported Living" />
        <StringListEditor label="Program / service levels" value={s.value.program_levels} onChange={(v) => s.update({ ...s.value, program_levels: v })} placeholder="e.g. Level 3" />
      </div>
    </SectionShell>
  );
}

// ─── Regulator Identity ──────────────────────────────────────────────────────

function RegulatorEditor({ value, onSave }: { value: Partial<StateRegulatorSection>; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<StateRegulatorSection>(
    {
      name_short: value.name_short ?? "",
      name_long: value.name_long ?? "",
      parent_agency_short: value.parent_agency_short ?? "",
      parent_agency_long: value.parent_agency_long ?? "",
      medicaid_program_name: value.medicaid_program_name ?? "",
      submission_portal_url: value.submission_portal_url ?? "",
      incident_deadline_hours: value.incident_deadline_hours ?? 24,
    },
    onSave,
  );
  return (
    <SectionShell
      id="section-regulator"
      title="Regulator Identity"
      blurb="The regulating body's full identity — short/long names, parent agency, Medicaid program, where reports are filed, and incident-reporting deadline."
      dirty={s.dirty} saving={s.saving} onSave={s.save}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Regulator short name (e.g. DSPD)">
          <input value={s.value.name_short ?? ""} onChange={(e) => s.update({ ...s.value, name_short: e.target.value })}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Regulator full name">
          <input value={s.value.name_long ?? ""} onChange={(e) => s.update({ ...s.value, name_long: e.target.value })}
            placeholder="Division of Services for People with Disabilities"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Parent agency short name (e.g. DHHS)">
          <input value={s.value.parent_agency_short ?? ""} onChange={(e) => s.update({ ...s.value, parent_agency_short: e.target.value })}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Parent agency full name">
          <input value={s.value.parent_agency_long ?? ""} onChange={(e) => s.update({ ...s.value, parent_agency_long: e.target.value })}
            placeholder="Department of Health and Human Services"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Medicaid program name">
          <input value={s.value.medicaid_program_name ?? ""} onChange={(e) => s.update({ ...s.value, medicaid_program_name: e.target.value })}
            placeholder="e.g. Utah Medicaid"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Submission portal URL">
          <input type="url" value={s.value.submission_portal_url ?? ""} onChange={(e) => s.update({ ...s.value, submission_portal_url: e.target.value })}
            placeholder="https://…"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Incident-report deadline (hours)">
          <input type="number" min={1} max={168}
            value={s.value.incident_deadline_hours ?? 24}
            onChange={(e) => s.update({ ...s.value, incident_deadline_hours: Number(e.target.value) })}
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
      </div>
    </SectionShell>
  );
}

// ─── Numeric Caps & Limits ───────────────────────────────────────────────────

function CapsEditor({ value, onSave }: { value: Partial<StateCapsSection>; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<StateCapsSection>(
    {
      respite_max_consecutive_days: value.respite_max_consecutive_days,
      respite_annual_days: value.respite_annual_days,
      els_daily_units: value.els_daily_units,
      els_annual_days: value.els_annual_days,
      pba_receipt_threshold_usd: value.pba_receipt_threshold_usd,
      belongings_signature_threshold_usd: value.belongings_signature_threshold_usd,
    },
    onSave,
  );
  const num = (v: number | undefined) => (v === undefined || v === null ? "" : String(v));
  const set = (k: keyof StateCapsSection, raw: string) =>
    s.update({ ...s.value, [k]: raw === "" ? undefined : Number(raw) });
  return (
    <SectionShell
      id="section-caps"
      title="Numeric Caps & Limits"
      blurb="State-specific numeric thresholds enforced by the platform. Leave blank to surface 'Not yet configured' to providers."
      dirty={s.dirty} saving={s.saving} onSave={s.save}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Respite — max consecutive days">
          <input type="number" min={0} value={num(s.value.respite_max_consecutive_days)} onChange={(e) => set("respite_max_consecutive_days", e.target.value)}
            placeholder="e.g. 14"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Respite — annual day ceiling">
          <input type="number" min={0} value={num(s.value.respite_annual_days)} onChange={(e) => set("respite_annual_days", e.target.value)}
            placeholder="e.g. 21"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="ELS — daily unit cap">
          <input type="number" min={0} value={num(s.value.els_daily_units)} onChange={(e) => set("els_daily_units", e.target.value)}
            placeholder="e.g. 24"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="ELS — annual service days">
          <input type="number" min={0} value={num(s.value.els_annual_days)} onChange={(e) => set("els_annual_days", e.target.value)}
            placeholder="e.g. 260"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="PBA receipt threshold (USD)">
          <input type="number" min={0} value={num(s.value.pba_receipt_threshold_usd)} onChange={(e) => set("pba_receipt_threshold_usd", e.target.value)}
            placeholder="e.g. 50"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
        <Field label="Belongings signature threshold (USD)">
          <input type="number" min={0} value={num(s.value.belongings_signature_threshold_usd)} onChange={(e) => set("belongings_signature_threshold_usd", e.target.value)}
            placeholder="e.g. 50"
            className="min-h-[40px] w-full rounded-md border border-border bg-background px-3 text-sm" />
        </Field>
      </div>
    </SectionShell>
  );
}

// ─── Regulation Citations ────────────────────────────────────────────────────

function CitationsEditor({ value, onSave }: { value: { sections?: StateCitation[] }; onSave: (v: unknown) => Promise<void> }) {
  const s = useSectionState<{ sections: StateCitation[] }>({ sections: value.sections ?? [] }, onSave);
  const update = (i: number, patch: Partial<StateCitation>) => {
    const next = [...s.value.sections];
    next[i] = { ...next[i], ...patch };
    s.update({ sections: next });
  };
  return (
    <SectionShell
      id="section-citations"
      title="Regulation Citations"
      blurb="The text and source the UI quotes when blocking an action (e.g. 'Section 7.4 — Respite caps')."
      dirty={s.dirty} saving={s.saving} onSave={s.save}
    >
      <div className="space-y-2">
        {s.value.sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No citations yet.</p>
        ) : s.value.sections.map((c, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-border bg-muted/20 p-2 md:grid-cols-12">
            <input value={c.key} onChange={(e) => update(i, { key: e.target.value })} placeholder="key (e.g. respite_caps)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 font-mono text-xs md:col-span-3" />
            <input value={c.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label (e.g. Respite caps)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm md:col-span-3" />
            <input value={c.cite} onChange={(e) => update(i, { cite: e.target.value })} placeholder="Citation (e.g. Section 7.4)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 text-sm md:col-span-3" />
            <input type="url" value={c.url ?? ""} onChange={(e) => update(i, { url: e.target.value || null })} placeholder="Source URL (optional)"
              className="min-h-[36px] rounded-md border border-border bg-background px-2 text-xs md:col-span-2" />
            <button onClick={() => s.update({ sections: s.value.sections.filter((_, x) => x !== i) })}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted md:col-span-1" aria-label="Remove">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => s.update({ sections: [...s.value.sections, { key: "", label: "", cite: "", url: null }] })}
        className="mt-2 inline-flex min-h-[36px] items-center gap-1 rounded-md border border-dashed border-border px-3 text-xs text-muted-foreground hover:bg-muted"
      >
        <Plus className="h-3 w-3" /> Add citation
      </button>
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

// ═══ INVENTORY TAB ═══════════════════════════════════════════════════════════
// NECTAR-driven inventory of Utah-specific values + structural gap tracking.

function InventoryTab({ stateCode }: { stateCode: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStructuralGaps);
  const fileFn = useServerFn(fileStructuralGap);
  const updateFn = useServerFn(updateStructuralGap);

  const gapsQ = useQuery({
    queryKey: ["state-structural-gaps", stateCode],
    queryFn: () => listFn({ data: { stateCode } }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gaps = (gapsQ.data ?? []) as Array<any>;

  const fileGap = useMutation({
    mutationFn: (item: InventoryItem) =>
      fileFn({
        data: {
          stateCode,
          area: item.area,
          summary: item.label,
          detail: `${item.utah_value}\n\nSource: ${item.source}${item.note ? "\n\n" + item.note : ""}`,
        },
      }),
    onSuccess: () => {
      toast.success("Structural gap filed — HIVE Executive ticket created.");
      qc.invalidateQueries({ queryKey: ["state-structural-gaps", stateCode] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const setStatus = useMutation({
    mutationFn: (vars: { id: string; status: "open" | "in_progress" | "resolved" | "wont_fix" }) =>
      updateFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state-structural-gaps", stateCode] }),
  });

  const isUtah = stateCode === "UT";
  const total = STATE_INVENTORY.length;
  const extracted = STATE_INVENTORY.filter((i) => i.extracted).length;
  const configCount = STATE_INVENTORY.filter((i) => i.kind === "config").length;
  const structuralCount = STATE_INVENTORY.filter((i) => i.kind === "structural").length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#f4a93a]/30 bg-[#f4a93a]/[0.06] p-4">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4a93a]/15 ring-1 ring-[#f4a93a]/30">
            <Sparkles className="h-4 w-4 text-[#9a3412]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-semibold text-[#9a3412]">
              NECTAR Inventory — Utah-specific values
            </h3>
            <p className="mt-1 text-xs text-[#9a3412]/80">
              Every value the platform currently assumes is Utah. Items tagged{" "}
              <strong>config</strong> are (or will be) editable on each state's template.
              Items tagged <strong>structural</strong> need real engineering — flag them to open a HIVE Executive ticket.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[#9a3412]/80">
              <span>{total} total · {extracted} extracted to template · {total - extracted} pending</span>
              <span>{configCount} config · {structuralCount} structural</span>
            </div>
          </div>
        </div>
      </div>

      {INVENTORY_AREAS.map((area) => {
        const items = STATE_INVENTORY.filter((i) => i.area === area.key);
        if (items.length === 0) return null;
        return (
          <section key={area.key} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h4 className="mb-2 text-sm font-semibold tracking-tight">{area.label}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left">Item</th>
                    <th className="px-2 py-1.5 text-left">Utah value</th>
                    <th className="px-2 py-1.5 text-left">Source</th>
                    <th className="px-2 py-1.5 text-left">Status</th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        <div className="font-medium text-foreground">{item.label}</div>
                        {item.note && <div className="mt-0.5 text-[10px] text-muted-foreground">{item.note}</div>}
                      </td>
                      <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">
                        {isUtah ? item.utah_value : "—"}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-muted-foreground">{item.source}</td>
                      <td className="px-2 py-2">
                        {item.kind === "structural" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-900">
                            Structural
                          </span>
                        ) : item.extracted ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-900">
                            Extracted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                            Pending Phase 2
                          </span>
                        )}
                        {item.template_path && (
                          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.template_path}</div>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {item.kind === "structural" && (
                          <button
                            type="button"
                            onClick={() => fileGap.mutate(item)}
                            disabled={fileGap.isPending}
                            className="inline-flex min-h-[28px] items-center gap-1 rounded-md border border-rose-200 bg-white px-2 text-[10px] font-medium text-rose-900 hover:bg-rose-50 disabled:opacity-50"
                          >
                            <AlertTriangle className="h-3 w-3" /> File HIVE ticket
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold tracking-tight">Filed structural gaps</h4>
        {gapsQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : gaps.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            No structural gaps filed for {stateCode} yet. Use the "File HIVE ticket" buttons above to flag items that can't be solved with configuration.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {gaps.map((g) => (
              <li key={g.id} className="flex items-start justify-between gap-2 rounded-md border border-border bg-background p-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium">{g.summary}</div>
                  <div className="text-[10px] text-muted-foreground">{g.area} · filed {new Date(g.created_at).toLocaleDateString()}</div>
                </div>
                <select
                  value={g.status}
                  onChange={(e) => setStatus.mutate({ id: g.id, status: e.target.value as "open" | "in_progress" | "resolved" | "wont_fix" })}
                  className="shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[11px]"
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="wont_fix">Won't fix</option>
                </select>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Base template version banner ────────────────────────────────────────────

function BaseVersionBanner({ stateCode }: { stateCode: string }) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewStateBaseUpgrade);
  const upgradeFn = useServerFn(upgradeStateToBaseVersion);
  const q = useQuery({
    queryKey: ["state-base-upgrade", stateCode],
    queryFn: () => previewFn({ data: { stateCode } }),
    retry: false,
  });
  const upgrade = useMutation({
    mutationFn: (toVersion: number) => upgradeFn({ data: { stateCode, toVersion } }),
    onSuccess: () => {
      toast.success("State upgraded to the new base template. State-specific data preserved; new fields are blank for you to fill in.");
      qc.invalidateQueries({ queryKey: ["state-base-upgrade", stateCode] });
      qc.invalidateQueries({ queryKey: ["state-template", stateCode] });
      qc.invalidateQueries({ queryKey: ["platform-states"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return null;
  if (q.isError || !q.data) return null;
  const d = q.data;

  if (d.upToDate) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
        <CheckCircle2 className="h-3.5 w-3.5" /> Base template v{d.fromVersion} · current
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-amber-900">
            <Sparkles className="h-4 w-4" />
            <span className="font-semibold">Base template update available</span>
            <span className="rounded-full border border-amber-300 bg-white/70 px-2 py-0.5 font-mono text-[11px]">
              v{d.fromVersion} → v{d.toVersion}
            </span>
          </div>
          {("toTitle" in d) && d.toTitle ? (
            <div className="mt-1 text-xs font-medium text-amber-950">{d.toTitle}</div>
          ) : null}
          {("toSummary" in d) && d.toSummary ? (
            <p className="mt-0.5 text-xs text-amber-900/80">{d.toSummary}</p>
          ) : null}
          {(d.added.length > 0 || d.removed.length > 0) ? (
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              {d.added.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-white/70 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-900">New / added</div>
                  <ul className="space-y-0.5 text-[11px] text-amber-950">
                    {d.added.slice(0, 12).map((c, i) => (
                      <li key={i}>
                        <span className="font-mono">{c.section}</span>
                        {c.field ? <span> · {c.field}</span> : null}
                        {c.note ? <span className="text-amber-900/70"> — {c.note}</span> : null}
                      </li>
                    ))}
                    {d.added.length > 12 ? <li className="text-amber-900/70">+ {d.added.length - 12} more</li> : null}
                  </ul>
                </div>
              ) : null}
              {d.removed.length > 0 ? (
                <div className="rounded-md border border-amber-200 bg-white/70 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-rose-900">Removed</div>
                  <ul className="space-y-0.5 text-[11px] text-amber-950">
                    {d.removed.slice(0, 12).map((c, i) => (
                      <li key={i}>
                        <span className="font-mono">{c.section}</span>
                        {c.field ? <span> · {c.field}</span> : null}
                      </li>
                    ))}
                    {d.removed.length > 12 ? <li className="text-amber-900/70">+ {d.removed.length - 12} more</li> : null}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-amber-900/80">No field-level changes — version metadata only.</p>
          )}
          <p className="mt-2 text-[11px] text-amber-900/80">
            Upgrading preserves all state-specific values you've already entered. New fields appear blank for you to fill in.
          </p>
        </div>
        <button
          onClick={() => upgrade.mutate(d.toVersion)}
          disabled={upgrade.isPending}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a] disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> {upgrade.isPending ? "Upgrading…" : `Update to v${d.toVersion}`}
        </button>
      </div>
    </div>
  );
}

