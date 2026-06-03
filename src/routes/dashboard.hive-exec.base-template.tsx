import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Sparkles, CheckCircle2, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import {
  listBaseTemplateVersions,
  publishBaseTemplateVersion,
} from "@/lib/state-base-versions.functions";
import type { BaseTemplateSchema, BaseTemplateVersion } from "@/lib/state-base-versions";

export const Route = createFileRoute("/dashboard/hive-exec/base-template")({
  head: () => ({ meta: [{ title: "Base template versions — HIVE Executive" }] }),
  component: BaseTemplatePage,
});

function BaseTemplatePage() {
  const listFn = useServerFn(listBaseTemplateVersions);
  const q = useQuery({ queryKey: ["base-template-versions"], queryFn: () => listFn() });
  const versions = (q.data ?? []) as BaseTemplateVersion[];
  const current = versions.find((v) => v.is_current) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          to="/dashboard/hive-exec/states"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to States
        </Link>
      </div>

      <header className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">HIVE base template versions</h2>
            <p className="text-xs text-muted-foreground">
              The base template is the state-neutral structure. Each state is stamped with the version it was built from; states on older versions can be updated without losing their entered values.
            </p>
          </div>
        </div>
      </header>

      <PublishNewVersion current={current} />

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 font-display text-sm font-semibold">Version history</h3>
        {q.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No versions yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {versions.map((v) => (
              <li key={v.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#0f1b3d] px-2 py-0.5 font-mono text-[11px] font-semibold text-white">
                    v{v.version}
                  </span>
                  <span className="font-medium text-sm">{v.title}</span>
                  {v.is_current ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                      <CheckCircle2 className="h-3 w-3" /> Current
                    </span>
                  ) : null}
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {new Date(v.released_at).toLocaleString()}
                  </span>
                </div>
                {v.summary ? (
                  <p className="mt-1 text-xs text-muted-foreground">{v.summary}</p>
                ) : null}
                {v.changelog?.length ? (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                    {v.changelog.slice(0, 8).map((c, i) => (
                      <li key={i}>
                        <span className={
                          c.type === "added" ? "font-semibold text-emerald-700"
                            : c.type === "removed" ? "font-semibold text-rose-700"
                              : "font-semibold text-amber-700"
                        }>
                          {c.type}
                        </span>{" "}
                        <span className="font-mono">{c.section}</span>
                        {c.field ? <span> · {c.field}</span> : null}
                        {c.note ? <span> — {c.note}</span> : null}
                      </li>
                    ))}
                    {v.changelog.length > 8 ? (
                      <li>+ {v.changelog.length - 8} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Publish a new version (HIVE Executive only) ─────────────────────────────

function PublishNewVersion({ current }: { current: BaseTemplateVersion | null }) {
  const qc = useQueryClient();
  const publishFn = useServerFn(publishBaseTemplateVersion);

  const initialSchema: BaseTemplateSchema = current?.schema ?? { sections: [] };
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [sections, setSections] = useState<BaseTemplateSchema["sections"]>(
    () => (initialSchema.sections ?? []).map((s) => ({ key: s.key, fields: [...s.fields] })),
  );

  const publish = useMutation({
    mutationFn: () => publishFn({
      data: {
        title: title.trim(),
        summary: summary.trim(),
        notes: notes.trim() || undefined,
        schema: { sections },
      },
    }),
    onSuccess: (r) => {
      toast.success(`Published base template v${r.version}.`);
      qc.invalidateQueries({ queryKey: ["base-template-versions"] });
      qc.invalidateQueries({ queryKey: ["platform-states"] });
      setTitle(""); setSummary(""); setNotes("");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addSection = () => setSections((s) => [...s, { key: "", fields: [] }]);
  const removeSection = (i: number) => setSections((s) => s.filter((_, idx) => idx !== i));
  const renameSection = (i: number, key: string) =>
    setSections((s) => s.map((sec, idx) => idx === i ? { ...sec, key } : sec));
  const updateFields = (i: number, fields: string[]) =>
    setSections((s) => s.map((sec, idx) => idx === i ? { ...sec, fields } : sec));

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-2 font-display text-sm font-semibold">Publish new base version</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Edits to the structure (sections / fields) get versioned. Each state's filled-in values are preserved when they upgrade. Until the build is finalized, expect frequent versions — versioning keeps it manageable.
      </p>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="block text-xs">
          <span className="text-muted-foreground">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={current ? `v${current.version + 1} — what changed` : "v1 — Initial base template"}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">Summary</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line description of this version"
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold">Sections &amp; fields</span>
          <button
            onClick={addSection}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium hover:bg-muted"
          >
            <Plus className="h-3 w-3" /> Section
          </button>
        </div>
        <ul className="space-y-2">
          {sections.map((sec, i) => (
            <li key={i} className="rounded-md border border-border bg-background p-2">
              <div className="flex items-center gap-2">
                <input
                  value={sec.key}
                  onChange={(e) => renameSection(i, e.target.value)}
                  placeholder="section_key"
                  className="w-48 rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
                />
                <button
                  onClick={() => removeSection(i)}
                  className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-700 hover:bg-rose-50"
                  aria-label="Remove section"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <textarea
                value={sec.fields.join("\n")}
                onChange={(e) => updateFields(i, e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
                rows={Math.max(2, Math.min(8, sec.fields.length + 1))}
                placeholder="one field per line"
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]"
              />
            </li>
          ))}
          {sections.length === 0 ? (
            <li className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              No sections yet — start with the current version's structure above, or add sections.
            </li>
          ) : null}
        </ul>
      </div>

      <label className="mt-3 block text-xs">
        <span className="text-muted-foreground">Release notes (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="What and why for this version (also added to the changelog)"
          className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
        />
      </label>

      <div className="mt-3 flex justify-end">
        <button
          onClick={() => publish.mutate()}
          disabled={publish.isPending || !title.trim() || sections.length === 0}
          className="inline-flex min-h-[36px] items-center gap-2 rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a] disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> {publish.isPending ? "Publishing…" : `Publish v${(current?.version ?? 0) + 1}`}
        </button>
      </div>
    </section>
  );
}
