import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCaseload, type CaseloadClient } from "@/hooks/use-caseload";

const MOCK_WORKSPACE_CLIENTS: Record<string, CaseloadClient> = {
  "mock-client-john-smith": {
    id: "mock-client-john-smith",
    first_name: "John",
    last_name: "Smith",
    home_latitude: null,
    home_longitude: null,
    pcsp_goals: ["Practice grocery budgeting", "Community outing 1x/week"],
    job_code: ["T2017"],
    medicaid_id: null,
    physical_address: "Maple House — 412 N Main St",
  },
  "mock-client-jane-doe": {
    id: "mock-client-jane-doe",
    first_name: "Jane",
    last_name: "Doe",
    home_latitude: null,
    home_longitude: null,
    pcsp_goals: ["Morning hygiene routine", "Prepare lunch independently"],
    job_code: ["S5125"],
    medicaid_id: null,
    physical_address: "Oak House — 88 Willow Ln",
  },
};
import { Badge } from "@/components/ui/badge";
import { PunchPad } from "@/components/evv/punch-pad";
import { padMemberId } from "@/lib/evv-codes";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  FileText,
  Pill,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { AboutTab } from "@/components/workspace/about-tab";
import { EmarTab } from "@/components/workspace/emar-tab";
import { FormsHubTab } from "@/components/workspace/forms-hub-tab";
import { IdlePinLock } from "@/components/workspace/idle-pin-lock";

export const Route = createFileRoute("/dashboard/workspace/$clientId")({
  head: () => ({ meta: [{ title: "Client Workspace — Care Academy" }] }),
  component: ClientWorkspace,
});

function ClientWorkspace() {
  const { clientId } = Route.useParams();
  const { data: caseload, isLoading } = useCaseload();
  const navigate = useNavigate();

  const isMock = clientId.startsWith("mock-client-");
  const client = useMemo(() => {
    if (isMock) return MOCK_WORKSPACE_CLIENTS[clientId] ?? null;
    return (caseload ?? []).find((c) => c.id === clientId) ?? null;
  }, [caseload, clientId, isMock]);

  // Security guard: if not in caseload (and not a mock test client), deny access.
  useEffect(() => {
    if (isMock) return;
    if (!isLoading && caseload && !client) {
      toast.error("You are not assigned to this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, caseload, client, navigate, isMock]);

  if ((!isMock && isLoading) || !client) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const codes = Array.isArray(client.job_code) ? client.job_code : [];

  return (
    <>
      <div className="mx-auto w-full max-w-4xl space-y-5 px-3 sm:px-0">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex h-11 items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to my caseload
          </Link>
          <div className="mt-2 flex flex-col items-start gap-4 sm:flex-row">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {client.first_name} {client.last_name}
              </h1>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {codes.length ? (
                  codes.map((code) => (
                    <Badge
                      key={code}
                      variant="outline"
                      className="font-mono text-[10px]"
                    >
                      {code}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">
                    No billing codes on file
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* In-Chart EVV Punch Pad — client is permanently locked */}
        <PunchPad
          entryType="Client_Profile_Pass"
          lockedClient={{
            id: client.id,
            name: `${client.first_name} ${client.last_name}`.trim(),
            memberId: padMemberId(client.medicaid_id),
            facility: client.physical_address,
          }}
        />

        <Tabs defaultValue="about" className="w-full">
          {/* Touch-friendly tab bar — mirrored across mobile and desktop */}
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 p-1">
            <TabsTrigger
              value="about"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <User className="h-4 w-4" />
              <span>About</span>
            </TabsTrigger>
            <TabsTrigger
              value="emar"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <Pill className="h-4 w-4" />
              <span>eMAR</span>
            </TabsTrigger>
            <TabsTrigger
              value="forms"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <FileText className="h-4 w-4" />
              <span>Forms</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="mt-5">
            <AboutTab client={client} />
          </TabsContent>

          <TabsContent value="emar" className="mt-5">
            <EmarTab
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
            />
          </TabsContent>

          <TabsContent value="forms" className="mt-5">
            <FormsHubTab
              clientId={client.id}
              clientName={`${client.first_name} ${client.last_name}`}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* 3-minute shared-device idle lock — scoped to this route */}
      <IdlePinLock />
    </>
  );
}
