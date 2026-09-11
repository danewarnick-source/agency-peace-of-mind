import { useCurrentOrg } from "@/hooks/use-org";
import { useCompliancePacket } from "@/hooks/use-compliance-packet";
import { OrgClientFileMatrix } from "@/components/client-file/org-client-file-matrix";
import { PacketNextActionCard } from "@/components/compliance/packet-next-action";
import { ROLE_RANK } from "@/lib/rbac";

export function ClientFilePanel() {
  const { data: org, isLoading } = useCurrentOrg();
  const packetQ = useCompliancePacket(org?.organization_id, "client");

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!org) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to open the client file.
      </div>
    );
  }

  const canAccess = ROLE_RANK[org.role] >= ROLE_RANK.manager;
  if (!canAccess) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You do not have permission to view the organization client file.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[var(--hive-gold)]/30 bg-gradient-to-br from-[#fff7ed] via-white to-white p-5 shadow-[var(--shadow-card)]">
        <h1 className="font-display text-xl font-bold tracking-tight text-[var(--hive-text)]">
          Client file
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Org-wide file status from the same artifacts as each client&apos;s Client file. Open a row
          for that person. Practice audit and evidence pull reuse Internal Audit — this is not a
          separate audit system.
        </p>
      </div>
      <PacketNextActionCard
        nextAction={packetQ.data?.packet.nextAction}
        emptyLabel="No open client-file action."
      />
      <OrgClientFileMatrix
        organizationId={org.organization_id}
        hiddenCardKeys={packetQ.data?.hiddenClientCards ?? []}
      />
    </div>
  );
}
