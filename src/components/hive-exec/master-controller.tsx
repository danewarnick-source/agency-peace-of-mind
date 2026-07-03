import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getOrgFeatureBundle, setOrgFeature, type FeatureRegistryRow } from "@/lib/org-features.functions";

/**
 * Organization Master Controller.
 *
 * HIVE Executive-only surface for turning on/off tabs, sub-tabs, and NECTAR
 * sub-features per organization. Renders the feature_registry grouped by
 * parent_key with a toggle bound to organization_features.enabled.
 *
 * New sub-features added to the registry automatically appear here and
 * inherit gating via the useOrgFeatures / useFeatureEnabled hooks.
 */
export function MasterController({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const bundleFn = useServerFn(getOrgFeatureBundle);
  const setFn = useServerFn(setOrgFeature);

  const q = useQuery({
    queryKey: ["org-feature-bundle", organizationId],
    queryFn: () => bundleFn({ data: { organizationId } }),
  });

  const toggleMut = useMutation({
    mutationFn: (vars: { featureKey: string; enabled: boolean }) =>
      setFn({ data: { organizationId, featureKey: vars.featureKey, enabled: vars.enabled } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-feature-bundle", organizationId] });
      qc.invalidateQueries({ queryKey: ["my-org-features"] });
      toast.success("Feature updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const registry = q.data?.registry ?? [];
  const effective = q.data?.effective ?? {};
  const topLevel = registry.filter((r) => !r.parent_key);
  const childrenOf = (key: string) => registry.filter((r) => r.parent_key === key);

  return (
    <section className="rounded-xl border-2 border-[#0f1b3d]/20 bg-card p-4 shadow-sm">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-[#0f1b3d]" />
            Organization Master Controller
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Gatekeeper for this company&apos;s access to tabs, sub-tabs, and NECTAR features.
            Toggling a parent OFF disables its children automatically.
          </p>
        </div>
        {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      </header>

      {q.isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading feature registry…</div>
      ) : topLevel.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No features registered yet.</div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {topLevel.map((r) => (
            <FeatureRow
              key={r.feature_key}
              row={r}
              effective={effective}
              children={childrenOf(r.feature_key)}
              onToggle={(k, e) => toggleMut.mutate({ featureKey: k, enabled: e })}
              parentEnabled={true}
              depth={0}
              registry={registry}
              disabled={toggleMut.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FeatureRow({
  row,
  effective,
  children,
  onToggle,
  parentEnabled,
  depth,
  registry,
  disabled,
}: {
  row: FeatureRegistryRow;
  effective: Record<string, boolean>;
  children: FeatureRegistryRow[];
  onToggle: (key: string, enabled: boolean) => void;
  parentEnabled: boolean;
  depth: number;
  registry: FeatureRegistryRow[];
  disabled: boolean;
}) {
  const isOn = effective[row.feature_key] === true;
  const greyed = !parentEnabled;
  const childrenOf = (key: string) => registry.filter((r) => r.parent_key === key);

  return (
    <>
      <li
        className={`flex items-center gap-3 px-3 py-2.5 ${greyed ? "opacity-50" : ""}`}
        style={{ paddingLeft: 12 + depth * 20 }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{row.label}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.category}
            </span>
          </div>
          {row.description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{row.description}</p>
          ) : null}
        </div>
        <Toggle
          on={isOn}
          disabled={disabled || greyed}
          onChange={(next) => onToggle(row.feature_key, next)}
        />
      </li>
      {children.map((c) => (
        <FeatureRow
          key={c.feature_key}
          row={c}
          effective={effective}
          children={childrenOf(c.feature_key)}
          onToggle={onToggle}
          parentEnabled={parentEnabled && isOn}
          depth={depth + 1}
          registry={registry}
          disabled={disabled}
        />
      ))}
    </>
  );
}

function Toggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        on ? "bg-emerald-600" : "bg-muted-foreground/30"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
