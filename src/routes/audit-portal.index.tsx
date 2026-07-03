import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Calendar, Building2, ArrowRight, ShieldCheck } from "lucide-react";
import { AuditPortalShell } from "@/components/audit-portal/audit-portal-shell";
import { listMyAuditPackages } from "@/lib/audit-portal.functions";

export const Route = createFileRoute("/audit-portal/")({
  head: () => ({
    meta: [
      { title: "State Audit Portal — HIVE" },
      { name: "description", content: "Secure portal for state auditors reviewing DSPD provider records." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AuditPortalIndex,
});

function AuditPortalIndex() {
  return (
    <AuditPortalShell>
      {(auditor) => {
        const listFn = useServerFn(listMyAuditPackages);
        const listQ = useQuery({
          queryKey: ["my-audit-packages", auditor.auditor_account_id],
          queryFn: () => listFn(),
        });
        const rows = listQ.data ?? [];

        return (
          <div className="space-y-4">
            <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#0f1b3d]">
                    Audit packages granted to you
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    You have access only to packages that provider organizations have
                    explicitly released and granted to your account. Content is
                    read-only.
                  </p>
                </div>
              </div>
            </header>

            {listQ.isLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-muted-foreground">
                Loading your granted packages…
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <FileText className="mx-auto h-8 w-8 text-slate-300" />
                <div className="mt-2 text-sm font-medium text-[#0f1b3d]">No packages yet</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  A provider organization will notify you when a package is released.
                </div>
              </div>
            ) : (
              <ul className="space-y-3">
                {rows.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/audit-portal/$packageId"
                      params={{ packageId: p.id }}
                      className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-[#0f1b3d] hover:shadow-md"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-[#0f1b3d]/10 px-2 py-0.5 text-xs font-medium uppercase text-[#0f1b3d]">
                            {p.status}
                          </span>
                          <span className="font-medium text-[#0f1b3d]">
                            {p.title ?? `${p.state_agency} audit`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> {p.organization_name ?? "—"}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {p.date_range_start} → {p.date_range_end}
                          </span>
                          <span>{p.subject_count} subjects</span>
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-slate-300 group-hover:text-[#0f1b3d]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </AuditPortalShell>
  );
}
