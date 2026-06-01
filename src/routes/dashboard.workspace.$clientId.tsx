import { useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCaseload } from "@/hooks/use-caseload";


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
  Clock,
  FileText,
  Pill,
  User,
  AlertTriangle,
  Info,
} from "lucide-react";
import { ClientQuickInfoSheet } from "@/components/staff-mobile/client-quick-info-sheet";

import { toast } from "sonner";
import { AboutTab } from "@/components/workspace/about-tab";
import { MarEmarTab } from "@/components/workspace/mar-emar-tab";
import { FormsHubTab } from "@/components/workspace/forms-hub-tab";
import { IdlePinLock } from "@/components/workspace/idle-pin-lock";

const workspaceSearch = z.object({ tab: z.string().optional(), code: z.string().optional() });
export const Route = createFileRoute("/dashboard/workspace/$clientId")({
  head: () => ({ meta: [{ title: "Client Workspace — HIVE" }] }),
  validateSearch: workspaceSearch,
  component: ClientWorkspace,
});

function ClientWorkspace() {
  const { clientId } = Route.useParams();
  const { data: caseload, isLoading } = useCaseload();
  const navigate = useNavigate();
  const { tab: tabParam, code: presetCode } = Route.useSearch();

  const client = useMemo(() => {
    return (caseload ?? []).find((c) => c.id === clientId) ?? null;
  }, [caseload, clientId]);

  useEffect(() => {
    if (!isLoading && caseload && !client) {
      toast.error("You are not assigned to this individual.");
      navigate({ to: "/dashboard" });
    }
  }, [isLoading, caseload, client, navigate]);

  if (isLoading || !client) {
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
            {client.profile_photo_url ? (
              <img
                src={client.profile_photo_url}
                alt={`${client.first_name} ${client.last_name}`}
                className="h-10 w-10 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {client.first_name[0]}{client.last_name[0]}
              </span>
            )}
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

        {client.special_directions && (
          <div className="flex items-start gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
                Special Directions & Clinical Alerts
              </p>
              <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-300 whitespace-pre-wrap">
                {client.special_directions}
              </p>
            </div>
          </div>
        )}

        <Tabs
          value={tabParam ?? "about"}
          onValueChange={(val) => navigate({ to: ".", search: { tab: val }, replace: true })}
          className="w-full"
        >
          {/* Touch-friendly tab bar — mirrored across mobile and desktop */}
          <TabsList className="grid h-auto w-full grid-cols-4 gap-1 p-1">
            <TabsTrigger
              value="about"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <User className="h-4 w-4" />
              <span>About</span>
            </TabsTrigger>
            <TabsTrigger
              value="clock-in"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <Clock className="h-4 w-4" />
              <span>Clock In</span>
            </TabsTrigger>
            <TabsTrigger
              value="emar"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <Pill className="h-4 w-4" />
              <span>MAR</span>
            </TabsTrigger>
            <TabsTrigger
              value="forms"
              className="h-11 min-w-[44px] gap-1.5 text-xs sm:text-sm"
            >
              <FileText className="h-4 w-4" />
              <span>Forms & Reports</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="mt-5">
            <AboutTab client={client} />
          </TabsContent>

          <TabsContent value="clock-in" className="mt-5">
            <PunchPad
              entryType="Client_Profile_Pass"
              lockedClient={{
                id: client.id,
                name: `${client.first_name} ${client.last_name}`.trim(),
                memberId: padMemberId(client.medicaid_id),
                facility: client.physical_address,
                authorizedCodes: client.job_code ?? undefined,
                homeLat: client.home_latitude,
                homeLng: client.home_longitude,
                geofenceRadiusFeet: client.geofence_radius_feet ?? 1000,
                pcspGoals: client.pcsp_goals ?? [],
              }}
              presetServiceCode={presetCode}
              lockServiceCode={!!presetCode}
            />
          </TabsContent>

          <TabsContent value="emar" className="mt-5">
            <MarEmarTab
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
