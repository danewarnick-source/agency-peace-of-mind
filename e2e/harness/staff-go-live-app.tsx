import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { setNavigateImpl } from "./mocks/tanstack-router";
import { PunchPadClockInStage } from "./punch-pad-clock-in-stage";
import { PunchPadClockOutStage } from "./punch-pad-clock-out-stage";
import { TOMMY_ID } from "./fixtures";
import type { NavCall } from "./e2e-bridge";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

type Scene = "staff-home" | "punch-pad-clock-in" | "punch-pad-clock-out";

function sceneForScenario(scenario: string): Scene {
  if (scenario === "admin") return "staff-home";
  if (scenario === "clock-out") return "punch-pad-clock-out";
  if (
    scenario === "clock-in" ||
    scenario === "gps-denied" ||
    scenario === "gps-timeout" ||
    scenario === "launchpad-blocked"
  ) {
    return "punch-pad-clock-in";
  }
  return "staff-home";
}

export function StaffGoLiveApp() {
  const scenario = window.__e2e.scenario;
  const [scene, setScene] = useState<Scene>(() => sceneForScenario(scenario));
  const [workspace, setWorkspace] = useState<{
    clientId: string;
    search: Record<string, string | undefined>;
  } | null>(() =>
    sceneForScenario(scenario) === "staff-home"
      ? null
      : {
          clientId: TOMMY_ID,
          search: {
            code: "SEI",
            verify: scenario === "clock-out" ? "1" : undefined,
          },
        },
  );

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

  const admin = scenario === "admin";

  return (
    <QueryClientProvider client={qc}>
      <div data-e2e-view={admin ? "admin" : "staff"}>
        {scene === "staff-home" && (
          <div data-e2e-scene="staff-home">
            <h1>{admin ? "Admin home" : "Staff home"}</h1>
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
