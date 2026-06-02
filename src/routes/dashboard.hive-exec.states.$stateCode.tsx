import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Save, Upload, FileText, CheckCircle2, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  getStateTemplate,
  updateStateTemplateSection,
  publishStateTemplate,
} from "@/lib/state-templates.functions";
import {
  listStateRequirementSources,
  createStateRequirementSource,
  deleteStateRequirementSource,
} from "@/lib/state-requirements.functions";
import { listStateProviders } from "@/lib/state-requirements.functions";
import { TEMPLATE_SECTIONS, type TemplateSectionKey } from "@/lib/state-templates";

export const Route = createFileRoute("/dashboard/hive-exec/states/$stateCode")({
  head: ({ params }) => ({ meta: [{ title: `${params.stateCode} — State Template` }] }),
  component: StateDetailPage,
});

function StateDetailPage() {
  const { stateCode } = Route.useParams();
  const [tab, setTab] = useState<"template" | "requirements" | "providers">("template");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChild = pathname.endsWith("/onboarding");
  if (isChild) return <Outlet />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          to="/dashboard/hive-exec/states"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All states
        </Link>
        <h2 className="font-display text-lg font-semibold">{stateCode} — State Configuration</h2>
        <Link
          to="/dashboard/hive-exec/states/$stateCode/onboarding"
          params={{ stateCode }}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a]"
        >
          Run state onboarding
        </Link>
      </div>

      <nav className="flex gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {(
          [
            ["template", "Template"],
            ["requirements", "Requirements & Sources"],
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

      {tab === "template" ? <TemplateTab stateCode={stateCode} /> : null}
      {tab === "requirements" ? <RequirementsTab stateCode={stateCode} /> : null}
      {tab === "providers" ? <ProvidersTab stateCode={stateCode} /> : null}
    </div>
  );
}

// ─── Template tab ─────────────────────────────────────────────────────────────

function TemplateTab({ stateCode }: { stateCode: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStateTemplate);
  const saveFn = useServerFn(updateStateTemplateSection);
  const publishFn = useServerFn(publishStateTemplate);

  const q = useQuery({
    queryKey: ["state-template", stateCode],
    queryFn: () => getFn({ data: { stateCode } }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tpl = (q.data ?? null) as any;

  const publish = useMutation({
    mutationFn: () => publishFn({ data: { stateCode } }),
    onSuccess: () => {
      toast.success("State template published.");
      qc.invalidateQueries({ queryKey: ["state-template", stateCode] });
      qc.invalidateQueries({ queryKey: ["platform-states"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
        <div className="text-muted-foreground">
          {tpl?.published_at
            ? <>Published {new Date(tpl.published_at).toLocaleString()}</>
            : <>Unpublished draft — providers in this state read the last published version.</>}
        </div>
        <button
          onClick={() => publish.mutate()}
          disabled={publish.isPending}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white shadow-sm hover:bg-[#b8631a] disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> {publish.isPending ? "Publishing…" : "Publish template"}
        </button>
      </div>

      {q.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">Loading template…</div>
      ) : (
        TEMPLATE_SECTIONS.map((s) => (
          <SectionEditor
            key={s.key}
            stateCode={stateCode}
            section={s.key}
            label={s.label}
            value={tpl?.[s.key] ?? {}}
            saveFn={saveFn}
            onSaved={() => qc.invalidateQueries({ queryKey: ["state-template", stateCode] })}
          />
        ))
      )}
    </div>
  );
}

function SectionEditor({
  stateCode,
  section,
  label,
  value,
  saveFn,
  onSaved,
}: {
  stateCode: string;
  section: TemplateSectionKey;
  label: string;
  value: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveFn: any;
  onSaved: () => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error("Invalid JSON: " + (e as Error).message);
      }
      return saveFn({ data: { stateCode, section, value: parsed } });
    },
    onSuccess: () => {
      toast.success(`${label} saved.`);
      setDirty(false);
      setErr(null);
      onSaved();
    },
    onError: (e) => {
      setErr((e as Error).message);
      toast.error((e as Error).message);
    },
  });

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold">{label}</h3>
        <button
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          <Save className="h-3 w-3" /> {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        className="w-full rounded-md border border-border bg-background p-3 font-mono text-xs"
        rows={Math.min(20, Math.max(6, text.split("\n").length))}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      {err ? <p className="mt-1 text-xs text-[#b91c1c]">{err}</p> : null}
    </section>
  );
}

// ─── Requirements tab ─────────────────────────────────────────────────────────

function RequirementsTab({ stateCode }: { stateCode: string }) {
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
          NECTAR parses these the same way it parses provider Foundation A/B sources — deriving the state's requirement set with source attribution.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            placeholder="Title (e.g. DSPD Provider Code)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-[40px] rounded-md border border-border bg-background px-3 text-sm md:col-span-2"
          />
          <input
            placeholder="Jurisdiction (optional)"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            className="min-h-[40px] rounded-md border border-border bg-background px-3 text-sm"
          />
          <button
            onClick={() => add.mutate()}
            disabled={!title.trim() || add.isPending}
            className="min-h-[40px] rounded-md bg-[#d97a1c] px-3 text-sm font-semibold text-white hover:bg-[#b8631a] disabled:opacity-50 md:col-span-3"
          >
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
                <button
                  onClick={() => remove.mutate(r.id)}
                  className="text-xs text-[#b91c1c] hover:underline"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Providers tab ────────────────────────────────────────────────────────────

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
              <Link
                to="/dashboard/hive-exec/$orgId"
                params={{ orgId: o.id }}
                className="font-medium hover:underline"
              >
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
