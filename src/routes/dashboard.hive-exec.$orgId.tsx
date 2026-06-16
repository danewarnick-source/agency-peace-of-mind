import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, Save, Users, Contact2, Clock, Activity } from "lucide-react";
import { toast } from "sonner";
import { getCompanyDetail, upsertSubscription } from "@/lib/hive-exec.functions";

export const Route = createFileRoute("/dashboard/hive-exec/$orgId")({
  component: CompanyDetailPage,
});

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CompanyDetailPage() {
  const { orgId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const detailFn = useServerFn(getCompanyDetail);
  const saveFn = useServerFn(upsertSubscription);

  const detailQ = useQuery({
    queryKey: ["hive-exec-company", orgId],
    queryFn: () => detailFn({ data: { organizationId: orgId } }),
  });

  const [plan, setPlan] = useState("starter");
  const [status, setStatus] = useState("trial");
  const [mrr, setMrr] = useState("0");
  const [renewal, setRenewal] = useState("");
  const [trial, setTrial] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const s = detailQ.data?.subscription;
    if (!s) return;
    setPlan(s.plan);
    setStatus(s.status);
    setMrr(String((s.mrr_cents / 100).toFixed(2)));
    setRenewal(s.renewal_date ?? "");
    setTrial(s.trial_ends_at ?? "");
    setNotes(s.notes ?? "");
  }, [detailQ.data?.subscription]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organizationId: orgId,
          patch: {
            plan,
            status,
            mrr_cents: Math.round(parseFloat(mrr || "0") * 100),
            renewal_date: renewal || null,
            trial_ends_at: trial || null,
            notes: notes || null,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Subscription updated");
      qc.invalidateQueries({ queryKey: ["hive-exec-company", orgId] });
      qc.invalidateQueries({ queryKey: ["hive-exec-companies"] });
      qc.invalidateQueries({ queryKey: ["hive-exec-kpis"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const d = detailQ.data;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => window.history.length > 1 ? router.history.back() : router.navigate({ to: "/dashboard/hive-exec" })}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to companies
      </button>

      <header className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <h1 className="font-display text-2xl font-bold text-[#0f1b3d]">{d?.name ?? "Loading…"}</h1>
        <p className="text-xs text-muted-foreground">
          Account &amp; billing only — no client records or PHI accessible from this view.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <UsageTile icon={Users} label="Staff (active)" value={d?.usage.staff_count ?? "—"} />
        <UsageTile icon={Contact2} label="Clients (count)" value={d?.usage.client_count ?? "—"} />
        <UsageTile icon={Clock} label="Hours logged · 30d" value={d ? d.usage.hours_last_30d.toFixed(1) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-display text-lg font-semibold">Subscription</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Plan">
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm">
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="paused">Paused</option>
                <option value="canceled">Canceled</option>
              </select>
            </Field>
            <Field label="MRR (USD)">
              <input type="number" step="0.01" min="0" value={mrr} onChange={(e) => setMrr(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Renewal date">
              <input type="date" value={renewal} onChange={(e) => setRenewal(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Trial ends">
              <input type="date" value={trial} onChange={(e) => setTrial(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </Field>
            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {d?.subscription
                ? `Active since ${new Date(d.subscription.started_at).toLocaleDateString()} · ${fmtMoney(d.subscription.mrr_cents)} MRR`
                : "No subscription on file yet."}
            </div>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="inline-flex items-center gap-1 rounded-md bg-[#0f1b3d] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#1a2a5a] disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save subscription
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
            <Activity className="h-4 w-4" /> Support tickets
          </h2>
          {(!d?.tickets || d.tickets.length === 0) ? (
            <p className="text-sm text-muted-foreground">No tickets for this company yet.</p>
          ) : (
            <ul className="space-y-2">
              {d.tickets.map((t) => (
                <li key={t.id} className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.subject}</span>
                    <span className="rounded bg-white px-2 py-0.5 text-xs">{t.status.replace("_", " ")}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t.source} · {t.severity} · {new Date(t.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function UsageTile({
  icon: Icon, label, value,
}: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums text-[#0f1b3d]">{value}</div>
    </div>
  );
}
