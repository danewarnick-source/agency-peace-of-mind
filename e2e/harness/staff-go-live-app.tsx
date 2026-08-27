import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { CompassVoiceButton } from "@/components/staff-mobile/compass-voice-button";
import { setNavigateImpl } from "./mocks/tanstack-router";
import { PunchPadClockInStage } from "./punch-pad-clock-in-stage";
import { PunchPadClockOutStage } from "./punch-pad-clock-out-stage";
import type { NavCall } from "./e2e-bridge";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

type Scene = "staff-home" | "punch-pad-clock-in" | "punch-pad-clock-out";

export function StaffGoLiveApp() {
  const [scene, setScene] = useState<Scene>("staff-home");
  const [workspace, setWorkspace] = useState<{
    clientId: string;
    search: Record<string, string | undefined>;
  } | null>(null);

  useEffect(() => {
    setNavigateImpl((args: NavCall) => {
      if (args.to === "/dashboard/workspace/$clientId") {
        const clientId = args.params?.clientId ?? "";
        const search = args.search ?? {};
        setWorkspace({ clientId, search });
        setScene(search.verify === "1" ? "punch-pad-clock-out" : "punch-pad-clock-in");
      }
    });
  }, []);

  const admin = window.__e2e.scenario === "admin";

  return (
    <QueryClientProvider client={qc}>
      <div data-e2e-view={admin ? "admin" : "staff"}>
        {scene === "staff-home" && (
          <div data-e2e-scene="staff-home">
            <h1>{admin ? "Admin home" : "Staff home"}</h1>
            {!admin && <CompassVoiceButton />}
          </div>
        )}
        {scene === "punch-pad-clock-in" && workspace && (
          <PunchPadClockInStage clientId={workspace.clientId} serviceCode={workspace.search.code} />
        )}
        {scene === "punch-pad-clock-out" && workspace && (
          <PunchPadClockOutStage search={workspace.search} />
        )}
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
