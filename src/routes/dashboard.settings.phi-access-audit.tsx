import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ScrollText } from "lucide-react";
import { useCurrentOrg } from "@/hooks/use-org";
import { RequireRole } from "@/components/rbac-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABEL, type Role } from "@/lib/rbac";
import { listPhiAccessAudit } from "@/lib/phi-access-audit.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard/settings/phi-access-audit")({
  head: () => ({ meta: [{ title: "PHI access log — Provider Interface" }] }),
  component: () => (
    <RequireRole roles={["admin", "program_manager", "manager"]}>
      <PhiAccessAuditPage />
    </RequireRole>
  ),
});

const RESOURCE_TYPES = [
  { value: "client_chart", label: "Client chart" },
  { value: "client_document", label: "Client document" },
  { value: "emar", label: "eMAR" },
  { value: "evv_timesheet", label: "EVV timesheet" },
  { value: "medication_list", label: "Medication list" },
  { value: "incident", label: "Incident" },
  { value: "daily_log", label: "Daily log" },
  { value: "other", label: "Other" },
] as const;

const ACTIONS = [
  { value: "view", label: "View" },
  { value: "download", label: "Download" },
  { value: "export", label: "Export" },
  { value: "ai_process", label: "AI process" },
] as const;

const RESOURCE_LABEL: Record<string, string> = Object.fromEntries(
  RESOURCE_TYPES.map((r) => [r.value, r.label]),
);
const ACTION_LABEL: Record<string, string> = Object.fromEntries(
  ACTIONS.map((a) => [a.value, a.label]),
);

function formatActorRole(role: string | null): string {
  if (!role) return "—";
  if (role in ROLE_LABEL) return ROLE_LABEL[role as Role];
  if (role === "super_admin") return "Platform admin";
  return role;
}

function PhiAccessAuditPage() {
  const { data: org } = useCurrentOrg();
  const listFn = useServerFn(listPhiAccessAudit);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [resourceType, setResourceType] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [breakGlassOnly, setBreakGlassOnly] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clientId, setClientId] = useState<string | undefined>();
  const [selectedClientName, setSelectedClientName] = useState("");

  const fromIso = fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined;
  const toIso = toDate ? new Date(`${toDate}T23:59:59.999`).toISOString() : undefined;

  const filters = useMemo(
    () => ({
      organizationId: org?.organization_id ?? "",
      clientId,
      resourceType: resourceType === "all" ? undefined : resourceType,
      action: action === "all" ? undefined : action,
      fromIso,
      toIso,
      breakGlassOnly: breakGlassOnly || undefined,
      limit: 100,
    }),
    [org?.organization_id, clientId, resourceType, action, fromIso, toIso, breakGlassOnly],
  );

  const { data, isLoading, isFetching } = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["phi-access-audit", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const rows = data?.rows ?? [];

  const { data: clientMatches = [] } = useQuery({
    enabled: !!org?.organization_id && clientSearch.trim().length >= 2 && !clientId,
    queryKey: ["phi-audit-client-search", org?.organization_id, clientSearch],
    queryFn: async () => {
      const term = clientSearch.trim();
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", org!.organization_id)
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .limit(8);
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>;
    },
  });

  const selectedClientLabel = clientId ? selectedClientName : clientSearch;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <Link
          to="/dashboard/settings"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Settings
        </Link>
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">PHI access log</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only audit trail of workforce access to protected client information — charts,
          documents, eMAR, EVV, and related records in {org?.organization_name ?? "your organization"}.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Logs are retained per agency policy (default 6 years once purge job is configured).
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="from-date" className="text-xs">
              From
            </Label>
            <Input
              id="from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="to-date" className="text-xs">
              To
            </Label>
            <Input
              id="to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Resource type</Label>
            <Select value={resourceType} onValueChange={setResourceType}>
              <SelectTrigger>
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RESOURCE_TYPES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Action</Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger>
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {ACTIONS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="client-search" className="text-xs">
              Client (optional)
            </Label>
            <div className="flex gap-2">
              <Input
                id="client-search"
                placeholder="Search by name…"
                value={clientId ? selectedClientLabel : clientSearch}
                onChange={(e) => {
                  setClientId(undefined);
                  setSelectedClientName("");
                  setClientSearch(e.target.value);
                }}
                disabled={!!clientId}
              />
              {clientId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setClientId(undefined);
                    setSelectedClientName("");
                    setClientSearch("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
            {!clientId && clientMatches.length > 0 && (
              <ul className="rounded-md border border-border bg-background text-xs">
                {clientMatches.map((c) => {
                  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-1.5 text-left hover:bg-muted"
                        onClick={() => {
                          setClientId(c.id);
                          setSelectedClientName(name || "Unnamed client");
                          setClientSearch(name);
                        }}
                      >
                        {name || "Unnamed client"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-end gap-2 pb-0.5 sm:col-span-2">
            <Switch
              id="break-glass-only"
              checked={breakGlassOnly}
              onCheckedChange={setBreakGlassOnly}
            />
            <Label htmlFor="break-glass-only" className="text-sm">
              Break-glass access only
            </Label>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Break-glass</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || isFetching) && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && !isFetching && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No PHI access events match these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.actor_name ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{formatActorRole(r.actor_role)}</div>
                </TableCell>
                <TableCell className="text-sm">
                  {ACTION_LABEL[r.action] ?? r.action}
                </TableCell>
                <TableCell className="text-sm">
                  {RESOURCE_LABEL[r.resource_type] ?? r.resource_type}
                </TableCell>
                <TableCell className="text-sm">{r.client_name ?? "—"}</TableCell>
                <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground" title={r.detail ?? undefined}>
                  {r.detail ?? "—"}
                </TableCell>
                <TableCell>
                  {r.break_glass ? (
                    <Badge variant="destructive">Break-glass</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
                  {r.ip ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="border-t border-border p-3 text-xs text-muted-foreground">
            Showing up to {filters.limit} most recent entries
            {isFetching && !isLoading ? " (refreshing…)" : ""}.
          </div>
        )}
      </div>
    </div>
  );
}
