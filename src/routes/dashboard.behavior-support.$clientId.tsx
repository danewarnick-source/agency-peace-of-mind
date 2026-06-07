import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Brain, Info } from "lucide-react";
import { BC_CONFIG, type BcCode } from "@/lib/behavior-support";

export const Route = createFileRoute("/dashboard/behavior-support/$clientId")({
  head: () => ({ meta: [{ title: "Behavior Support — HIVE" }] }),
  component: BehaviorSupportClientPage,
});

function BehaviorSupportClientPage() {
  const { clientId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["bs-client-page", clientId],
    queryFn: async () => {
      const [{ data: client }, { data: bsc }, { data: behaviors }] = await Promise.all([
        supabase.from("clients").select("id, first_name, last_name").eq("id", clientId).maybeSingle(),
        supabase
          .from("behavior_support_clients")
          .select("bc_code, features_enabled, assigned_behaviorist_user_id")
          .eq("client_id", clientId)
          .maybeSingle(),
        supabase
          .from("bc_behaviors")
          .select("id, name, status, expected_cadence")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),
      ]);
      return { client, bsc, behaviors: behaviors ?? [] };
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

  const code = (data.bsc.bc_code ?? "BC1") as BcCode;
  const spec = BC_CONFIG[code];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
      <Link
        to="/dashboard/behaviorist"
        className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to caseload
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <Brain className="h-5 w-5 text-[color:var(--teal-700,#137182)]" />
        <h2 className="text-xl font-semibold">
          {data.client.first_name} {data.client.last_name}
        </h2>
        <Badge variant="outline" className="font-mono">{code}</Badge>
        <Badge variant="outline" className="text-[10px]">{spec.severity}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target behaviors</CardTitle>
        </CardHeader>
        <CardContent>
          {data.behaviors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No behaviors drafted yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.behaviors.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-[11px] text-muted-foreground">Cadence: {b.expected_cadence}</p>
                  </div>
                  <Badge
                    variant={b.status === "published" ? "default" : "outline"}
                    className="text-[10px] font-mono uppercase"
                  >
                    {b.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start gap-1.5 rounded-md border border-dashed border-border bg-background/60 px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5" /> Behavior detail, data collection, notes, and sign-off arrive in
        Section 4+. This page is the stable landing target from the behaviorist caseload.
      </p>
    </div>
  );
}
