import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Brain, ChevronRight } from "lucide-react";
import { BC_CONFIG, type BcCode } from "@/lib/behavior-support";

export const Route = createFileRoute("/dashboard/behaviorist")({
  head: () => ({ meta: [{ title: "Behaviorist Caseload — HIVE" }] }),
  component: BehavioristCaseload,
});

type Row = {
  client_id: string;
  bc_code: BcCode;
  client: { id: string; first_name: string; last_name: string } | null;
  open_flags: number;
};

function BehavioristCaseload() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Read profile.bc_role to confirm the viewer is a behaviorist; if not, send them home.
  const { data: profile, isLoading: profileLoading } = useQuery({
    enabled: !!user,
    queryKey: ["my-bc-role", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, bc_role")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!loading && !profileLoading && profile && !profile.bc_role) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, profileLoading, profile, navigate]);

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    enabled: !!user && !!profile?.bc_role,
    queryKey: ["behaviorist-caseload", user?.id],
    queryFn: async () => {
      const { data: assignments, error } = await supabase
        .from("behavior_support_clients")
        .select("client_id, bc_code, features_enabled, assigned_behaviorist_user_id, clients:clients(id, first_name, last_name)")
        .eq("assigned_behaviorist_user_id", user!.id)
        .eq("features_enabled", true);
      if (error) throw error;

      const list = (assignments ?? []) as any[];
      const clientIds = list.map((a) => a.client_id);
      let flagCounts: Record<string, number> = {};
      if (clientIds.length) {
        const { data: flags } = await supabase
          .from("bc_flags")
          .select("client_id")
          .in("client_id", clientIds)
          .is("acknowledged_at", null);
        for (const f of flags ?? []) {
          flagCounts[(f as any).client_id] = (flagCounts[(f as any).client_id] ?? 0) + 1;
        }
      }

      return list.map((a) => ({
        client_id: a.client_id,
        bc_code: a.bc_code as BcCode,
        client: a.clients,
        open_flags: flagCounts[a.client_id] ?? 0,
      }));
    },
  });

  if (loading || profileLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-[color:var(--teal-700,#137182)]" />
          <div>
            <h1 className="text-xl font-semibold">Behaviorist Caseload</h1>
            <p className="text-xs text-muted-foreground">
              {profile?.full_name ?? "Behaviorist"} · Tier {profile?.bc_role ?? "—"} · clinical workflow only — no time clock
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading caseload…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No assigned clients yet. A Company Admin will assign you to a client via the Behavior Support config card on the client profile.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => {
            const spec = BC_CONFIG[r.bc_code];
            return (
              <Link
                key={r.client_id}
                to="/dashboard/behavior-support/$clientId"
                params={{ clientId: r.client_id }}
                className="group rounded-lg border border-border bg-background p-4 transition hover:border-primary hover:bg-accent"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">
                        {r.client?.first_name} {r.client?.last_name}
                      </h3>
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-bold ring-2 ${spec.tile.bg} ${spec.tile.fg} ${spec.tile.ring}`}
                      >
                        {r.bc_code}
                      </span>
                      {r.open_flags > 0 && (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="mr-1 h-3 w-3" />
                          {r.open_flags} open flag{r.open_flags === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{spec.severity}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
