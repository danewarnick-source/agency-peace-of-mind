import { useCurrentOrg } from "@/hooks/use-org";
import { useCompliancePacket } from "@/hooks/use-compliance-packet";
import { OrgPersonnelFileMatrix } from "@/components/personnel-file/org-personnel-file-matrix";
import { PacketNextActionCard, PacketScopeNote } from "@/components/compliance/packet-next-action";
import { ROLE_RANK } from "@/lib/rbac";

export function StaffFilePanel() {
  const { data: org, isLoading } = useCurrentOrg();
  const packetQ = useCompliancePacket(org?.organization_id, "staff");

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
