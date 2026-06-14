// Client Profile Hub — admin view of "everything about this client".
//
// IA principle: records live ONCE (in their canonical tables); this hub
// SURFACES them filtered to a single client. Reuses existing queries — no
// new tables, no business-logic changes, no billing math, no EVV CSV.
//
// Tabs: Overview / Plan & goals / Billing codes / Shifts / Daily logs /
// Incidents / Summaries / Host-home cert / Deadlines / Documents.

import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequirePermission } from "@/components/rbac-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ClientDocumentsCard } from "@/components/clients/client-documents-card";
import {
  ArrowLeft, User, FileText, ClipboardList, Clock, AlertTriangle,
  Stethoscope, HomeIcon, CalendarClock, FolderOpen, Sparkles, Pencil,
} from "lucide-react";

const search = z.object({
  tab: z
    .enum([
      "overview", "plan", "codes", "shifts", "logs", "incidents",
      "summaries", "hhcert", "deadlines", "documents",
    ])
    .optional(),
});

export const Route = createFileRoute("/dashboard/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client Profile — HIVE" }] }),
  validateSearch: search,
  component: () => (
    <RequirePermission perm="manage_users">
      <ClientProfileHub />
    </RequirePermission>
  ),
});

function ClientProfileHub() {
  const { clientId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;

  const clientQ = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, phone_number, physical_address, date_of_birth, medicaid_id, account_status, authorized_dspd_codes, pcsp_goals, job_code, special_directions, emergency_contact_name, emergency_contact_phone, team_id" as any)
        .eq("id", clientId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  const client = clientQ.data;
  const fullName = client
    ? `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "—"
    : "Loading…";
  // Host-home flag derived from authorized service codes (HHS).
  const codes: string[] = Array.isArray(client?.job_code)
    ? (client?.job_code as string[])
    : Array.isArray(client?.authorized_dspd_codes)
    ? (client?.authorized_dspd_codes as string[])
    : [];
  const isHostHome = codes.some((c) => String(c).toUpperCase() === "HHS");

  return (
    <div className="container mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard/hub/clients">
            <ArrowLeft className="h-4 w-4 mr-1" /> Clients
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate">{fullName}</h1>
          <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
            {client?.medicaid_id ? <span>Medicaid #{String(client.medicaid_id)}</span> : null}
            {client?.account_status ? <Badge variant="outline">{String(client.account_status)}</Badge> : null}
            {isHostHome ? <Badge variant="secondary">Host home</Badge> : null}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/clients">
            <Pencil className="h-4 w-4 mr-1" /> Edit in directory
          </Link>
        </Button>
      </div>

      <Tabs value={tab ?? "overview"} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto justify-start">
          <TabTrigger value="overview" icon={<User className="h-3.5 w-3.5" />} label="Overview" clientId={clientId} />
          <TabTrigger value="plan" icon={<Sparkles className="h-3.5 w-3.5" />} label="Plan & goals" clientId={clientId} />
          <TabTrigger value="codes" icon={<FileText className="h-3.5 w-3.5" />} label="Billing codes" clientId={clientId} />
          <TabTrigger value="shifts" icon={<Clock className="h-3.5 w-3.5" />} label="Shifts" clientId={clientId} />
          <TabTrigger value="logs" icon={<ClipboardList className="h-3.5 w-3.5" />} label="Daily logs" clientId={clientId} />
          <TabTrigger value="incidents" icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Incidents" clientId={clientId} />
          <TabTrigger value="summaries" icon={<Stethoscope className="h-3.5 w-3.5" />} label="Summaries" clientId={clientId} />
          {isHostHome ? (
            <TabTrigger value="hhcert" icon={<HomeIcon className="h-3.5 w-3.5" />} label="Host-home cert" clientId={clientId} />
          ) : null}
          <TabTrigger value="deadlines" icon={<CalendarClock className="h-3.5 w-3.5" />} label="Deadlines" clientId={clientId} />
          <TabTrigger value="documents" icon={<FolderOpen className="h-3.5 w-3.5" />} label="Documents" clientId={clientId} />
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewPanel client={client} clientId={clientId} />
        </TabsContent>
        <TabsContent value="plan" className="mt-6">
          <PlanGoalsPanel client={client} />
        </TabsContent>
        <TabsContent value="codes" className="mt-6">
          <BillingCodesPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="shifts" className="mt-6">
          <ShiftsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="logs" className="mt-6">
          <DailyLogsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="incidents" className="mt-6">
          <IncidentsPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        <TabsContent value="summaries" className="mt-6">
          <SummariesPanel clientId={clientId} orgId={orgId} />
        </TabsContent>
        {isHostHome ? (
          <TabsContent value="hhcert" className="mt-6">
            <HostHomeCertPanel clientId={clientId} orgId={orgId} />
          </TabsContent>
        ) : null}
        <TabsContent value="deadlines" className="mt-6">
          <DeadlinesPanel clientId={clientId} />
        </TabsContent>
        <TabsContent value="documents" className="mt-6">
          <ClientDocumentsCard clientId={clientId} clientName={fullName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TabTrigger({
  value, icon, label, clientId,
}: { value: string; icon: React.ReactNode; label: string; clientId: string }) {
  return (
    <TabsTrigger value={value} asChild>
      <Link
        to="/dashboard/clients/$clientId"
        params={{ clientId }}
        search={{ tab: value } as never}
        className="flex items-center gap-1.5"
      >
        {icon}
        {label}
      </Link>
    </TabsTrigger>
  );
}

// ─── Panels ───────────────────────────────────────────────────────────────────

type ClientRow = Record<string, unknown> | null | undefined;

function OverviewPanel({ client, clientId }: { client: ClientRow; clientId: string }) {
  if (!client) return <SkeletonCard />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Contact</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Field label="Phone" value={client.phone_number as string | null} />
          <Field label="Address" value={client.physical_address as string | null} />
          <Field label="Date of birth" value={client.date_of_birth as string | null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Emergency contact</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <Field label="Name" value={client.emergency_contact_name as string | null} />
          <Field label="Phone" value={client.emergency_contact_phone as string | null} />
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Special directions</CardTitle></CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">
          {(client.special_directions as string) || <span className="text-muted-foreground">None recorded.</span>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <QuickLink to="/dashboard/billing/$clientId" params={{ clientId }} label="Billing detail" />
          <QuickLink to="/dashboard/client-intake/$clientId" params={{ clientId }} label="Intake checklist" />
          <QuickLink to="/dashboard/hhs-hub/$clientId" params={{ clientId }} label="HHS hub" />
          <QuickLink to="/dashboard/behavior-support/$clientId" params={{ clientId }} label="Behavior support" />
          <QuickLink to="/dashboard/client-training/$clientId" params={{ clientId }} label="Client-specific training" />
        </CardContent>
      </Card>
    </div>
  );
}

function PlanGoalsPanel({ client }: { client: ClientRow }) {
  if (!client) return <SkeletonCard />;
  const goals = Array.isArray(client.pcsp_goals) ? (client.pcsp_goals as string[]) : [];
  const codes = Array.isArray(client.authorized_dspd_codes) ? (client.authorized_dspd_codes as string[]) : [];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">PCSP goals</CardTitle></CardHeader>
        <CardContent className="text-sm">
          {goals.length === 0 ? (
            <span className="text-muted-foreground">No goals recorded.</span>
          ) : (
            <ul className="list-disc pl-5 space-y-1">
              {goals.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Authorized DSPD codes</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 text-sm">
          {codes.length === 0 ? (
            <span className="text-muted-foreground">None.</span>
          ) : codes.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}

function BillingCodesPanel({ clientId }: { clientId: string }) {
  const q = useQuery({
    queryKey: ["client-profile-codes", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_billing_codes")
        .select("id, service_code, annual_unit_authorization, weekly_cap_units, monthly_max_units, unit_type, rate_per_unit, service_start_date, service_end_date")
        .eq("client_id", clientId)
        .order("service_start_date", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Billing authorizations (1056)</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/billing/$clientId" params={{ clientId }}>Open billing detail</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No billing codes authorized."
          rows={q.data ?? []}
          columns={[
            { header: "Code", cell: (r) => <code className="font-mono">{r.service_code}</code> },
            { header: "Unit", cell: (r) => r.unit_type ?? "—" },
            { header: "Annual auth", cell: (r) => r.annual_unit_authorization ?? "—" },
            { header: "Rate", cell: (r) => (r.rate_per_unit != null ? `$${Number(r.rate_per_unit).toFixed(2)}` : "—") },
            { header: "Effective", cell: (r) => `${r.service_start_date ?? "—"} → ${r.service_end_date ?? "open"}` },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function ShiftsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-shifts", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select("id, service_type_code, status, clock_in_timestamp, clock_out_timestamp, staff_id, billed_units")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("clock_in_timestamp", { ascending: false })
        .limit(200);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recent shifts (last 200)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No shifts recorded for this client."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.clock_in_timestamp ? new Date(r.clock_in_timestamp).toLocaleDateString() : "—" },
            { header: "Code", cell: (r) => <code className="font-mono">{r.service_type_code ?? "—"}</code> },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
            { header: "Units", cell: (r) => r.billed_units ?? "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function DailyLogsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-logs", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, log_date, status, narrative, submitted_at")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("log_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Daily logs (last 100)</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No daily logs recorded."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.log_date ?? "—" },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
            { header: "Submitted", cell: (r) => r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—" },
            { header: "Narrative", cell: (r) => <span className="line-clamp-2 max-w-md">{r.narrative ?? "—"}</span> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function IncidentsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-incidents", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incident_reports")
        .select("id, incident_date, incident_types, status, is_abuse_neglect, is_fatality, report_number")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("incident_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Incidents</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No incidents recorded."
          rows={q.data ?? []}
          columns={[
            { header: "Date", cell: (r) => r.incident_date ?? "—" },
            { header: "Report #", cell: (r) => <code className="font-mono text-xs">{r.report_number ?? "—"}</code> },
            { header: "Types", cell: (r) => Array.isArray(r.incident_types) ? (r.incident_types as string[]).join(", ") || "—" : "—" },
            {
              header: "Flags",
              cell: (r) => (
                <div className="flex gap-1">
                  {r.is_abuse_neglect ? <Badge variant="destructive">A/N</Badge> : null}
                  {r.is_fatality ? <Badge variant="destructive">Fatality</Badge> : null}
                  {!r.is_abuse_neglect && !r.is_fatality ? "—" : null}
                </div>
              ),
            },
            { header: "Status", cell: (r) => <Badge variant="outline">{r.status ?? "—"}</Badge> },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function SummariesPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-summaries", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_progress_summaries")
        .select("id, summary_kind, period_kind, period_label, period_start, period_end, status, finalized_at")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("period_end", { ascending: false })
        .limit(60);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Progress summaries</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No progress summaries on file."
          rows={q.data ?? []}
          columns={[
            { header: "Kind", cell: (r) => <Badge variant="outline">{r.summary_kind ?? "—"}</Badge> },
            { header: "Cadence", cell: (r) => r.period_kind ?? "—" },
            { header: "Period", cell: (r) => r.period_label ?? `${r.period_start ?? "—"} → ${r.period_end ?? "—"}` },
            { header: "Status", cell: (r) => r.status ?? "—" },
            { header: "Finalized", cell: (r) => r.finalized_at ? new Date(r.finalized_at).toLocaleDateString() : "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function HostHomeCertPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-hhcert", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("host_home_certifications")
        .select("id, inspection_date, next_due_date, determination, inspector_name, cert_type")
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("inspection_date", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Host-home certifications</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No host-home certifications on file."
          rows={q.data ?? []}
          columns={[
            { header: "Inspection", cell: (r) => r.inspection_date ?? "—" },
            { header: "Cert type", cell: (r) => r.cert_type ?? "—" },
            { header: "Next due", cell: (r) => r.next_due_date ?? "—" },
            { header: "Determination", cell: (r) => <Badge variant="outline">{r.determination ?? "—"}</Badge> },
            { header: "Inspector", cell: (r) => r.inspector_name ?? "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

function DeadlinesPanel({ clientId }: { clientId: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Deadlines</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Client-scoped deadlines are tracked centrally. Open the deadlines desk and filter by this client.{" "}
        <Link className="underline" to="/dashboard/deadlines">
          Open deadlines →
        </Link>
      </CardContent>
    </Card>
  );
}

function DocumentsPanel({ clientId, orgId }: { clientId: string; orgId?: string }) {
  const q = useQuery({
    enabled: !!orgId,
    queryKey: ["client-profile-docs", orgId, clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, file_name, document_type, uploaded_at" as any)
        .eq("organization_id", orgId!)
        .eq("client_id", clientId)
        .order("uploaded_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
      <CardContent className="p-0">
        <ReadOnlyTable
          loading={q.isLoading}
          empty="No documents on file."
          rows={q.data ?? []}
          columns={[
            { header: "Name", cell: (r) => r.file_name ?? "—" },
            { header: "Type", cell: (r) => r.document_type ?? "—" },
            { header: "Uploaded", cell: (r) => r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString() : "—" },
          ]}
        />
      </CardContent>
    </Card>
  );
}

// ─── Tiny shared bits ─────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-28 shrink-0">{label}:</span>
      <span>{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">Loading…</CardContent>
    </Card>
  );
}

function QuickLink<T extends Record<string, string>>({
  to, params, label,
}: { to: string; params: T; label: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Link to={to as any} params={params as any}>{label}</Link>
    </Button>
  );
}

type Col<R> = { header: string; cell: (row: R) => React.ReactNode };
function ReadOnlyTable<R extends Record<string, unknown>>({
  rows, columns, loading, empty,
}: { rows: R[]; columns: Col<R>[]; loading?: boolean; empty: string }) {
  if (loading) {
    return <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!rows.length) {
    return <div className="py-10 text-center text-sm text-muted-foreground">{empty}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => <TableHead key={c.header}>{c.header}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={(r.id as string) ?? i}>
              {columns.map((c) => <TableCell key={c.header}>{c.cell(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
