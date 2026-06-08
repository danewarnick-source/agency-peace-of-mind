import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/dashboard/client-intake/$clientId")({
  head: () => ({ meta: [{ title: "New Client Intake — HIVE" }] }),
  component: IntakePlaceholder,
});

function IntakePlaceholder() {
  const { clientId } = Route.useParams();
  const { data: client } = useQuery({
    queryKey: ["client-intake-header", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("first_name, last_name, intake_status")
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const name = client ? `${client.first_name} ${client.last_name}`.trim() : "this client";

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-8 sm:px-0">
      <Link
        to="/dashboard/hub/clients"
        search={{ tab: "directory" }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Clients
      </Link>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Intake procedure — coming in next build
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">{name}</span> has been created with intake status{" "}
            <span className="font-mono text-foreground">{client?.intake_status ?? "in_progress"}</span>.
          </p>
          <p>
            The full intake forms, attestations, and document handling will be added in the next build.
            For now, this is a placeholder so the fork and status are wired up end-to-end.
          </p>
          <div>
            <Button asChild variant="outline">
              <Link to="/dashboard/hub/clients" search={{ tab: "directory" }}>
                Return to directory
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
