import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Brain } from "lucide-react";
import { BC_CONFIG, type BcCode } from "@/lib/behavior-support";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { FbaBspStrip } from "@/components/behavior-support/fba-bsp-strip";
import { BehaviorsPanel } from "@/components/behavior-support/behaviors-panel";
import { DataCharts } from "@/components/behavior-support/data-charts";
import { NotesPanel } from "@/components/behavior-support/notes-panel";
import { AuditFeed } from "@/components/behavior-support/audit-feed";
import { SowDeadlinesPanel } from "@/components/behavior-support/sow-deadlines";

export const Route = createFileRoute("/dashboard/behavior-support/$clientId")({
  head: () => ({ meta: [{ title: "Behavior Support — HIVE" }] }),
  component: BehaviorSupportClientPage,
});

function BehaviorSupportClientPage() {
  const { clientId } = Route.useParams();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgRole = org?.role;
  const orgId = org?.organization_id;

  const { data, isLoading } = useQuery({
    enabled: !!orgId && !!user?.id,
    queryKey: ["bs-client-page", clientId],
    queryFn: async () => {
      const [{ data: client }, { data: bsc }] = await Promise.all([
        supabase.from("clients").select("id, first_name, last_name, organization_id").eq("id", clientId).maybeSingle(),
        supabase
          .from("behavior_support_clients")
          .select("bc_code, features_enabled, assigned_behaviorist_user_id, organization_id")
          .eq("client_id", clientId)
          .maybeSingle(),
      ]);
      return { client, bsc };
    },
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!data?.client) return <p className="p-6 text-sm text-muted-foreground">Client not found.</p>;
  if (!data.bsc?.features_enabled) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Behavior Support features are off for this client.
        </p>
      </div>
    );
  }

  const isAdmin = orgRole === "admin" || orgRole === "super_admin";
  const isBehaviorist = !isAdmin && data.bsc.assigned_behaviorist_user_id === user?.id;

  // Staff should not reach this surface — send them to the client workspace
  if (!isAdmin && !isBehaviorist) {
    return <Navigate to="/dashboard/workspace/$clientId" params={{ clientId }} search={{ tab: "behavior-data" }} />;
  }

  const role: "admin" | "behaviorist" = isAdmin ? "admin" : "behaviorist";
  const code = (data.bsc.bc_code ?? "BC1") as BcCode;
  const spec = BC_CONFIG[code];
  const organizationId = data.bsc.organization_id ?? data.client.organization_id;
  const backTo = isBehaviorist ? "/dashboard/behaviorist" : "/dashboard/clients";

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <Link
        to={backTo}
        className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <Brain className="h-5 w-5 text-[color:var(--teal-700,#137182)]" />
        <h2 className="text-xl font-semibold">
          {data.client.first_name} {data.client.last_name}
        </h2>
        <Badge variant="outline" className="font-mono">{code}</Badge>
        <Badge variant="outline" className="text-[10px]">{spec.severity}</Badge>
        <Badge variant="outline" className="ml-auto text-[10px] uppercase">
          {role} view
        </Badge>
      </div>

      <FbaBspStrip clientId={clientId} organizationId={organizationId} canEdit={isAdmin || isBehaviorist} />

      <BehaviorsPanel clientId={clientId} organizationId={organizationId} role={role} />

      <DataCharts clientId={clientId} />

      <AuditFeed clientId={clientId} />

      <NotesPanel clientId={clientId} organizationId={organizationId} canWrite={isAdmin || isBehaviorist} />

      <SowDeadlinesPanel
        clientId={clientId}
        organizationId={organizationId}
        canWriteFlags={isAdmin || isBehaviorist}
      />
    </div>
  );
}
