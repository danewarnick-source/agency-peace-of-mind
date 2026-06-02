import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Star, Building2 } from "lucide-react";
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
  const styles =
    status === "active"
      ? "bg-emerald-100 text-emerald-900 border-emerald-200"
      : status === "draft"
        ? "bg-amber-100 text-amber-900 border-amber-200"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}>
      {isRef ? <Star className="h-3 w-3" /> : null}
      {status === "coming_soon" ? "Coming soon" : status === "active" ? "Active" : "Draft"}
      {isRef ? " · Reference" : ""}
    </span>
  );
}

function StatesIndexPage() {
  const fn = useServerFn(listPlatformStates);
  const q = useQuery({ queryKey: ["platform-states"], queryFn: () => fn() });
  const rows = (q.data ?? []) as Row[];

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
            ) : rows.map((r) => (
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
                    : r.template_updated_at
                      ? `Draft updated ${new Date(r.template_updated_at).toLocaleDateString()}`
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
                    <Link
                      to="/dashboard/hive-exec/states/$stateCode/onboarding"
                      params={{ stateCode: r.code }}
                      className="inline-flex min-h-[36px] items-center rounded-md bg-[#d97a1c] px-3 text-xs font-semibold text-white hover:bg-[#b8651a]"
                    >
                      {r.template_updated_at ? "Resume onboarding" : "Onboard"}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
