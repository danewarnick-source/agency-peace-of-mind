import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, User, Contact2, Calendar, AlertTriangle, Sparkles, FileText } from "lucide-react";
import { AuditPortalShell } from "@/components/audit-portal/audit-portal-shell";
import { getAuditorPackageView } from "@/lib/audit-portal.functions";
import type { AuditPackageSubjectSummary } from "@/lib/audit-package-data";

export const Route = createFileRoute("/audit-portal/$packageId")({
  head: () => ({
    meta: [
      { title: "Audit Package — HIVE State Audit Portal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditorPackageView,
});

function AuditorPackageView() {
  const { packageId } = Route.useParams();
  return (
    <AuditPortalShell>
      {() => {
        const viewFn = useServerFn(getAuditorPackageView);
        const viewQ = useQuery({
          queryKey: ["auditor-package-view", packageId],
          queryFn: () => viewFn({ data: { auditPackageId: packageId } }),
        });

        if (viewQ.isLoading) return <div className="text-sm text-muted-foreground">Loading package…</div>;
        if (viewQ.error) {
          return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
              <div className="font-semibold">Unable to open package.</div>
              <div className="mt-1">{viewQ.error instanceof Error ? viewQ.error.message : "Unknown error"}</div>
              <Link to="/audit-portal" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-800 hover:underline">
                <ArrowLeft className="h-3 w-3" /> Back to packages
              </Link>
            </div>
          );
        }

        const { package: pkg, payload } = viewQ.data!;

        return (
          <div className="space-y-4">
            <Link
              to="/audit-portal"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-[#0f1b3d]"
            >
              <ArrowLeft className="h-3 w-3" /> All packages
            </Link>

            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {pkg.state_agency}
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#0f1b3d]">
                    {pkg.title ?? `${pkg.state_agency} audit`}
                  </h2>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {pkg.date_range_start} → {pkg.date_range_end}
                    </span>
                    <span>Provider: {pkg.organization_name}</span>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium uppercase text-emerald-700">
                      {pkg.status}
                    </span>
                  </div>
                </div>
              </div>
              {payload.is_seed && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div>
                    <strong>Synthetic seed data.</strong> Real client and staff records
                    will be surfaced through this same view once HIVE's compliant host and
                    BAA are in effect. The layout you see here is representative.
                  </div>
                </div>
              )}
            </header>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#0f1b3d]">
                <Sparkles className="h-4 w-4 text-[#d97a1c]" /> NECTAR summary
              </div>
              <p className="text-sm text-slate-700">{payload.nectar_summary.overall}</p>
              {payload.nectar_summary.flags.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {payload.nectar_summary.flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3 w-3" />
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="space-y-3">
              {payload.subjects.map((s) => (
                <SubjectCard key={s.subject_id} subject={s} nectarNote={payload.nectar_summary.per_subject[s.subject_id]} />
              ))}
            </div>
          </div>
        );
      }}
    </AuditPortalShell>
  );
}

function SubjectCard({ subject, nectarNote }: { subject: AuditPackageSubjectSummary; nectarNote?: string }) {
  const Icon = subject.subject_type === "staff" ? User : Contact2;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{subject.subject_type}</div>
          <div className="font-semibold text-[#0f1b3d]">{subject.subject_label}</div>
        </div>
      </header>

      {nectarNote && (
        <div className="mb-3 rounded-md border border-[#fed7aa]/50 bg-[#fff7ed] p-2 text-xs text-[#9a3412]">
          <Sparkles className="mr-1 inline h-3 w-3" /> {nectarNote}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <RecordBlock title="Timesheets" empty={subject.timesheets.length === 0}>
          <ul className="space-y-1 text-xs">
            {subject.timesheets.map((t, i) => (
              <li key={i} className="flex justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                <span className="tabular-nums text-muted-foreground">{t.date}</span>
                <span>{t.service_code}</span>
                <span className="tabular-nums">{t.hours}h / {t.units}u</span>
                {t.evv_verified && <span className="text-emerald-600">EVV ✓</span>}
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="PCSP goals" empty={subject.pcsp_goals.length === 0}>
          <ul className="space-y-2 text-xs">
            {subject.pcsp_goals.map((g, i) => (
              <li key={i}>
                <div className="font-medium">{g.goal}</div>
                <div className="text-muted-foreground">{g.progress_pct}% · last note {g.last_note_date}</div>
                <div className="italic text-slate-600">&ldquo;{g.last_note}&rdquo;</div>
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="PBA ledger" empty={subject.pba_ledger.length === 0}>
          <ul className="space-y-1 text-xs">
            {subject.pba_ledger.map((l, i) => (
              <li key={i} className="flex justify-between border-b border-slate-100 pb-1 last:border-0">
                <span className="text-muted-foreground">{l.date}</span>
                <span>{l.memo}</span>
                <span className={`tabular-nums ${l.kind === "deposit" ? "text-emerald-700" : "text-red-700"}`}>
                  {l.kind === "deposit" ? "+" : "−"}${(l.amount_cents / 100).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </RecordBlock>

        <RecordBlock title="Billing support documents">
          <ul className="space-y-1 text-xs">
            {subject.billing_support_docs.map((d, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1 last:border-0">
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3 text-slate-400" /> {d.title}
                </span>
                <span className="text-muted-foreground tabular-nums">{d.date}</span>
                <span className={d.status === "on_file" ? "text-emerald-700" : "text-amber-700"}>
                  {d.status.replace("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </RecordBlock>
      </div>
    </section>
  );
}

function RecordBlock({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {empty ? <div className="text-xs italic text-slate-400">None recorded.</div> : children}
    </div>
  );
}
