import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useCurrentOrg } from "@/hooks/use-org";
import { useCompliancePacket } from "@/hooks/use-compliance-packet";
import { OrgPersonnelFileMatrix } from "@/components/personnel-file/org-personnel-file-matrix";
import { AdminExamExportButton } from "@/components/compliance/admin-exam-export-button";
import { PacketNextActionCard, PacketScopeNote } from "@/components/compliance/packet-next-action";
import { listPendingCertReviews, type CertReviewRow } from "@/lib/company-obligations.functions";
import { inHiveCourseIdForTitle } from "@/lib/in-hive-training";
import { ROLE_RANK } from "@/lib/rbac";

export function StaffFilePanel() {
  const { data: org, isLoading } = useCurrentOrg();
  const packetQ = useCompliancePacket(org?.organization_id, "staff");
  const pendingFn = useServerFn(listPendingCertReviews);
  const pendingQ = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["pending-cert-reviews", org?.organization_id],
    queryFn: () => pendingFn({ data: { organizationId: org!.organization_id } }),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!org) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to open the staff file.
      </div>
    );
  }

  const canAccess = ROLE_RANK[org.role] >= ROLE_RANK.manager;
  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view the organization staff file.
      </div>
    );
  }

  const packet = packetQ.data?.packet ?? null;
  const pendingRaw = pendingQ.data as CertReviewRow[] | { result?: CertReviewRow[] } | undefined;
  const pending = Array.isArray(pendingRaw) ? pendingRaw : (pendingRaw?.result ?? []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--hive-gold)]/30 bg-gradient-to-br from-[#fff7ed] via-white to-white p-5 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-xl font-bold tracking-tight text-[var(--hive-text)]">
          Staff file
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Org-wide file status from the same obligation instances as each employee&apos;s Staff
          file. Open a row for that staffer. Practice audit and evidence pull reuse Internal Audit —
          this is not a separate audit system.
        </p>
      </div>
      {pending.length > 0 ? (
        <div
          data-testid="pending-cert-reviews"
          className="rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-amber-950">
            {pending.length} certificate{pending.length === 1 ? "" : "s"} awaiting review
          </p>
          <ul className="mt-2 space-y-1.5">
            {pending.slice(0, 6).map((row) => (
              <li key={row.completionId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-amber-950">
                  {row.staffName} · {row.title}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {inHiveCourseIdForTitle(row.title) ? (
                    <AdminExamExportButton
                      staffId={row.staffId}
                      staffName={row.staffName}
                      obligationTitle={row.title}
                    />
                  ) : null}
                  <Link
                    to="/dashboard/compliance/cert-review/$completionId"
                    params={{ completionId: row.completionId }}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    Review
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <PacketNextActionCard
        nextAction={packet?.nextAction}
        emptyLabel="No open staff-file action in this scope."
      />
      <PacketScopeNote scoped={!!packet?.scoped} count={packet?.staffUserIds?.length ?? 0} />
      <OrgPersonnelFileMatrix
        organizationId={org.organization_id}
        staffIds={packet?.staffUserIds ?? null}
      />
    </div>
  );
}
