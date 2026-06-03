import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star, Building2, X, Sparkles, Copy } from "lucide-react";
import { useState } from "react";
import { listPlatformStates } from "@/lib/state-templates.functions";

export const Route = createFileRoute("/dashboard/hive-exec/states")({
  head: () => ({ meta: [{ title: "States — HIVE Executive" }] }),
  component: StatesIndexPage,
});

type Row = {
  code: string;
  name: string;
  status: string;
  is_reference: boolean;
  regulator_label: string | null;
  provider_count: number;
  template_updated_at: string | null;
  template_published_at: string | null;
};

function StatusChip({ status, isRef }: { status: string; isRef: boolean }) {
  const isActive = status === "active";
  const styles = isActive
    ? "bg-emerald-100 text-emerald-900 border-emerald-200"
    : "bg-slate-100 text-slate-600 border-slate-200";
  const label = isActive ? "Active" : status === "coming_soon" ? "Coming soon" : "Inactive";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {isRef ? <Star className="h-3 w-3" /> : null}
      {label}
      {isRef ? " · Reference" : ""}
    </span>
  );
}

function StatesIndexPage() {
  const fn = useServerFn(listPlatformStates);
  const q = useQuery({ queryKey: ["platform-states"], queryFn: () => fn() });
  const rows = (q.data ?? []) as Row[];
  const [chooser, setChooser] = useState<Row | null>(null);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#0f1b3d] text-white">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold">States</h2>
            <p className="text-xs text-muted-foreground">
              State is a configuration layer. Each state inherits the platform model and is edited as a template. Utah is the reference implementation.
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">State</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Regulator</th>
              <th className="px-4 py-2 text-right">Providers</th>
              <th className="px-4 py-2 text-left">Template</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">No states yet.</td></tr>
            ) : rows.map((r) => {
              const hasDraft = !!r.template_updated_at;
              return (
                <tr key={r.code} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-block w-8 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-[11px]">{r.code}</span>
                      {r.name}
                    </span>
                  </td>
                  <td className="px-4 py-2"><StatusChip status={r.status} isRef={r.is_reference} /></td>
                  <td className="px-4 py-2 text-muted-foreground">{r.regulator_label ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" /> {r.provider_count}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.template_published_at
                      ? `Published ${new Date(r.template_published_at).toLocaleDateString()}`
                      : hasDraft
                        ? `Draft updated ${new Date(r.template_updated_at!).toLocaleDateString()}`
                        : "No template yet"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Link
                        to="/dashboard/hive-exec/states/$stateCode"
                        params={{ stateCode: r.code }}
                        className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
                      >
                        Open
                      </Link>
                      {hasDraft ? (
                        <Link
                          to="/dashboard/hive-exec/states/$stateCode/onboarding"
                          params={{ stateCode: r.code }}
                          className="inline-flex min-h-[36px] items-center rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a]"
                        >
                          Resume onboarding
                        </Link>
                      ) : (
                        <button
                          onClick={() => setChooser(r)}
                          className="inline-flex min-h-[36px] items-center rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a]"
                        >
                          Build {r.code} template
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {chooser ? (
        <StartingPointChooser
          target={chooser}
          allStates={rows}
          onClose={() => setChooser(null)}
        />
      ) : null}
    </div>
  );
}

function StartingPointChooser({
  target,
  allStates,
  onClose,
}: {
  target: Row;
  allStates: Row[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const sources = allStates.filter(
    (s) => s.code !== target.code && !!s.template_updated_at,
  );
  const [mode, setMode] = useState<"blank" | "copy">("blank");
  const [sourceCode, setSourceCode] = useState<string>(
    sources.find((s) => s.is_reference)?.code ?? sources[0]?.code ?? "",
  );

  function start() {
    const startFrom = mode === "copy" && sourceCode ? sourceCode : "blank";
    navigate({
      to: "/dashboard/hive-exec/states/$stateCode/onboarding",
      params: { stateCode: target.code },
      search: { startFrom },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Starting point</div>
            <h3 className="font-display text-base font-semibold">Build {target.code} — {target.name} template</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Choose where to start from. You can edit everything afterwards.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
              mode === "blank" ? "border-[#d97a1c] bg-orange-50" : "border-border bg-background hover:bg-muted/40"
            }`}
          >
            <input
              type="radio"
              name="startfrom"
              checked={mode === "blank"}
              onChange={() => setMode("blank")}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-[#d97a1c]" /> Generic HIVE state template
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Neutral, state-agnostic base. Structure is in place; state-specific fields are empty for you to fill in.
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
              mode === "copy" ? "border-[#d97a1c] bg-orange-50" : "border-border bg-background hover:bg-muted/40"
            } ${sources.length === 0 ? "opacity-50" : ""}`}
          >
            <input
              type="radio"
              name="startfrom"
              checked={mode === "copy"}
              onChange={() => sources.length > 0 && setMode("copy")}
              disabled={sources.length === 0}
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Copy className="h-4 w-4 text-[#0f1b3d]" /> Copy from an existing state
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Start from another state's already-built template and edit the differences.
              </p>
              {sources.length === 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">No other states have a template yet.</p>
              ) : (
                <select
                  value={sourceCode}
                  onChange={(e) => setSourceCode(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={mode !== "copy"}
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
                >
                  {sources.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}{s.is_reference ? " (Reference)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </label>

          <p className="px-1 pt-1 text-[11px] text-muted-foreground">
            More starting points (regional templates, partial starters) will appear here as they're added.
          </p>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-3 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={start}
            className="inline-flex min-h-[36px] items-center rounded-md bg-[#d97a1c] px-4 text-xs font-semibold text-white hover:bg-[#b8651a]"
          >
            Start building
          </button>
        </div>
      </div>
    </div>
  );
}
