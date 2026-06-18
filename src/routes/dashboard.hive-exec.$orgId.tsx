import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ArrowLeft, Save, Users, Contact2, Clock, Activity, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { getCompanyDetail, upsertSubscription, updateOrgNames } from "@/lib/hive-exec.functions";

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
  const saveNamesFn = useServerFn(updateOrgNames);


  const detailQ = useQuery({
    queryKey: ["hive-exec-company", orgId],
    queryFn: () => detailFn({ data: { organizationId: orgId } }),
    refetchInterval: 30_000,
  });

  const [plan, setPlan] = useState("hive_standard");
  const [status, setStatus] = useState("active");
  const [mrr, setMrr] = useState("0");
  const [renewal, setRenewal] = useState("");
  const [notes, setNotes] = useState("");

  // Org identifying-info edit state
  const [nameEdit, setNameEdit] = useState("");
  const [legalEdit, setLegalEdit] = useState("");
  const [dbaEdit, setDbaEdit] = useState("");
  const [acronymEdit, setAcronymEdit] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [attest, setAttest] = useState(false);

  useEffect(() => {
    const s = detailQ.data?.subscription;
    if (!s) return;
    setPlan(s.plan);
    setStatus(s.status);
    setMrr(String((s.mrr_cents / 100).toFixed(2)));
    setRenewal(s.renewal_date ?? "");
    setNotes(s.notes ?? "");
  }, [detailQ.data?.subscription]);

  useEffect(() => {
    const d = detailQ.data;
    if (!d) return;
    setNameEdit(d.name ?? "");
    setLegalEdit(d.legal_name ?? "");
    setDbaEdit(d.dba_name ?? "");
    setAcronymEdit(d.display_acronym ?? "");
  }, [detailQ.data]);


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

  const saveNames = useMutation({
    mutationFn: () =>
      saveNamesFn({
        data: {
          organizationId: orgId,
          attestation: true,
          patch: {
            name: nameEdit,
            legal_name: legalEdit,
            dba_name: dbaEdit,
            display_acronym: acronymEdit,
          },
        },
      }),
    onSuccess: (r) => {
      toast.success(r.changed ? `Saved — ${r.changed} field(s) updated, logged.` : "No changes to save");
      setConfirmOpen(false);
      setAttest(false);
      qc.invalidateQueries({ queryKey: ["hive-exec-company", orgId] });
      qc.invalidateQueries({ queryKey: ["hive-exec-companies"] });
      qc.invalidateQueries({ queryKey: ["current-org"] });
      qc.invalidateQueries({ queryKey: ["my-memberships"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const d = detailQ.data;
  const nameDirty =
    !!d &&
    ((nameEdit.trim() || "") !== (d.name ?? "") ||
      (legalEdit.trim() || "") !== (d.legal_name ?? "") ||
      (dbaEdit.trim() || "") !== (d.dba_name ?? "") ||
      (acronymEdit.trim() || "") !== (d.display_acronym ?? ""));



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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">Billing contact phone: </span>
            {d?.billing_sms_phone ? (
              <span className="font-mono text-foreground">{d.billing_sms_phone}</span>
            ) : (
              <span className="text-amber-600">none on file</span>
            )}
          </span>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Pencil className="h-4 w-4" /> Identifying information
          </h2>
          <span className="text-[11px] text-muted-foreground">HIVE Executive · changes are audit-logged</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name (system)">
            <input value={nameEdit} onChange={(e) => setNameEdit(e.target.value)} maxLength={200}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Legal name">
            <input value={legalEdit} onChange={(e) => setLegalEdit(e.target.value)} maxLength={200}
              placeholder="e.g. Acme Supports LLC"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Doing-business-as (DBA)">
            <input value={dbaEdit} onChange={(e) => setDbaEdit(e.target.value)} maxLength={200}
              placeholder="Optional"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </Field>
          <Field label="Display acronym">
            <input value={acronymEdit} onChange={(e) => setAcronymEdit(e.target.value)} maxLength={12}
              placeholder="e.g. ACME"
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={!d || saveNames.isPending}
            onClick={() => {
              if (d) {
                setNameEdit(d.name ?? "");
                setLegalEdit(d.legal_name ?? "");
                setDbaEdit(d.dba_name ?? "");
                setAcronymEdit(d.display_acronym ?? "");
              }
            }}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={!nameDirty || !nameEdit.trim() || saveNames.isPending}
            onClick={() => { setAttest(false); setConfirmOpen(true); }}
            className="inline-flex items-center gap-1 rounded-md bg-[#0f1b3d] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#1a2a5a] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" /> Save name changes…
          </button>
        </div>
      </section>

      {confirmOpen && d ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h3 className="font-display text-lg font-semibold">Confirm identifying-info change</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              You are changing this organization&apos;s identifying information (company name, legal name, DBA, display acronym).
              Confirm that you have the organization&apos;s approval to make this change. This action is logged.
            </p>
            <div className="mb-4 max-h-48 overflow-auto rounded-md border border-border bg-muted/30 p-3 text-xs">
              <ul className="space-y-1">
                {(["name","legal_name","dba_name","display_acronym"] as const).map((f) => {
                  const labels: Record<string, string> = { name: "Company name", legal_name: "Legal name", dba_name: "DBA", display_acronym: "Acronym" };
                  const cur = (d[f] ?? "") as string;
                  const next =
                    f === "name" ? nameEdit.trim() :
                    f === "legal_name" ? legalEdit.trim() :
                    f === "dba_name" ? dbaEdit.trim() :
                    acronymEdit.trim();
                  if ((cur || "") === (next || "")) return null;
                  return (
                    <li key={f} className="font-mono">
                      <span className="font-semibold">{labels[f]}:</span>{" "}
                      <span className="text-muted-foreground">{cur || "(empty)"}</span>
                      {" → "}
                      <span className="text-foreground">{next || "(empty)"}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <label className="mb-4 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-1" />
              <span>I attest that I have the organization&apos;s approval to make this change.</span>
            </label>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => { setConfirmOpen(false); setAttest(false); }}
                disabled={saveNames.isPending}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!attest || saveNames.isPending}
                onClick={() => saveNames.mutate()}
                className="inline-flex items-center gap-1 rounded-md bg-[#0f1b3d] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#1a2a5a] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Confirm &amp; save
              </button>
            </div>
          </div>
        </div>
      ) : null}



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
