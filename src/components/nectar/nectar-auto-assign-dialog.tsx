import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { isDayProgramCode } from "@/lib/service-billing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  Calendar,
  User,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { evvServiceLabel } from "@/lib/evv-codes";

type ScopeClient = {
  id: string;
  first_name: string;
  last_name: string;
  physical_address: string | null;
  job_code: string[] | null;
};

type Proposal = {
  key: string;
  client: ScopeClient;
  staffId: string | null;
  staffName: string | null;
  serviceCode: string | null;
  startsAt: Date;
  endsAt: Date;
  valid: boolean;
  blockers: string[];
};

function nextWeekday(base: Date, offset: number): Date {
  const d = new Date(base);
  d.setHours(9, 0, 0, 0);
  let added = 0;
  let i = 0;
  while (added <= offset && i < 30) {
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      if (added === offset) break;
      added++;
    }
    d.setDate(d.getDate() + 1);
    i++;
  }
  return d;
}

export function NectarAutoAssignDialog({
  open,
  onClose,
  orgId,
  userId,
  clientsInScope,
  scopeLabel,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  userId: string;
  clientsInScope: ScopeClient[];
  scopeLabel: string;
}) {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  // Authorized billing codes from client_billing_codes (single source of truth).
  // Filtered here to exclude day-program codes (DSG/DSP/DSI) — those codes are
  // scheduled via the day-program module, not the standard shift auto-assign flow.
  const allBillingCodesQ = useAllClientBillingCodes();
  const billingCodesByClient = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allBillingCodesQ.data ?? []) {
      if (isDayProgramCode(row.service_code)) continue;
      if (!map.has(row.client_id)) map.set(row.client_id, []);
      map.get(row.client_id)!.push(row.service_code);
    }
    return map;
  }, [allBillingCodesQ.data]);

  // Pull staff_assignments + scheduled_shifts (next 7 days) for the scoped clients.
  const clientIds = useMemo(() => clientsInScope.map((c) => c.id), [clientsInScope]);

  const assignmentsQ = useQuery({
    enabled: open && clientIds.length > 0,
    queryKey: ["nectar-autoassign-assignments", orgId, clientIds],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_assignments")
        .select("staff_id, client_id, service_codes")
        .eq("organization_id", orgId)
        .in("client_id", clientIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        staff_id: string;
        client_id: string;
        service_codes: string[] | null;
      }>;
    },
  });

  const profilesQ = useQuery({
    enabled: open && !!assignmentsQ.data?.length,
    queryKey: [
      "nectar-autoassign-profiles",
      (assignmentsQ.data ?? []).map((a) => a.staff_id).sort().join(","),
    ],
    queryFn: async () => {
      const ids = Array.from(
        new Set((assignmentsQ.data ?? []).map((a) => a.staff_id).filter(Boolean)),
      );
      if (!ids.length) return [] as Array<{ id: string; full_name: string | null; email: string | null }>;
      const { data, error } = await (supabase as any)
        .from("org_member_directory")
        .select("id, full_name, email")
        .in("id", ids);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>;
    },
  });

  const existingQ = useQuery({
    enabled: open && clientIds.length > 0,
    queryKey: ["nectar-autoassign-existing", orgId, clientIds],
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 14);
      const { data, error } = await (supabase as any)
        .from("scheduled_shifts")
        .select("client_id, starts_at")
        .eq("organization_id", orgId)
        .in("client_id", clientIds)
        .gte("starts_at", start.toISOString())
        .lte("starts_at", end.toISOString());
      if (error) throw error;
      return (data ?? []) as Array<{ client_id: string; starts_at: string }>;
    },
  });

  const proposals: Proposal[] = useMemo(() => {
    if (!open) return [];
    const assignments = assignmentsQ.data ?? [];
    const profiles = profilesQ.data ?? [];
    const existing = existingQ.data ?? [];

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const existingByClient = new Set(existing.map((e) => e.client_id));

    return clientsInScope.map((client, i): Proposal => {
      const blockers: string[] = [];

      const startsAt = nextWeekday(new Date(), i);
      const endsAt = new Date(startsAt);
      endsAt.setHours(12, 0, 0, 0);

      const assn = assignments.find((a) => a.client_id === client.id);
      const staff = assn ? profileMap.get(assn.staff_id) : undefined;
      const staffName = staff?.full_name ?? staff?.email ?? null;
      // Use client_billing_codes as single source of truth; day-program codes already filtered.
      const authorizedCodes = billingCodesByClient.get(client.id) ?? [];
      const assignmentCodes = assn?.service_codes ?? [];
      const matchedCode =
        authorizedCodes.find((c) => assignmentCodes.includes(c)) ??
        authorizedCodes[0] ??
        null;

      if (!client.physical_address) blockers.push("Client has no service address");
      if (!authorizedCodes.length)
        blockers.push("Client has no authorized billing codes");
      if (!assn) blockers.push("No staff assigned to this client");
      else if (!staffName) blockers.push("Assigned staff profile is incomplete");
      if (authorizedCodes.length && !matchedCode)
        blockers.push("Staff not authorized for any of the client's codes");
      if (existingByClient.has(client.id))
        blockers.push("Client already has shifts scheduled this period");

      return {
        key: client.id,
        client,
        staffId: assn?.staff_id ?? null,
        staffName,
        serviceCode: matchedCode,
        startsAt,
        endsAt,
        valid: blockers.length === 0,
        blockers,
      };
    });
  }, [open, clientsInScope, assignmentsQ.data, profilesQ.data, existingQ.data, billingCodesByClient]);

  const validCount = proposals.filter((p) => p.valid).length;
  const blockedCount = proposals.length - validCount;

  const createMut = useMutation({
    mutationFn: async () => {
      const rows = proposals
        .filter((p) => p.valid && p.staffId && p.serviceCode)
        .map((p) => ({
          organization_id: orgId,
          staff_id: p.staffId!,
          client_id: p.client.id,
          job_code: p.serviceCode!,
          shift_type: "hourly",
          starts_at: p.startsAt.toISOString(),
          ends_at: p.endsAt.toISOString(),
          notes: "Auto-assigned by NECTAR — awaiting acceptance.",
          is_recurring: false,
          recurrence_rule: null,
          recurrence_end_date: null,
          status: "pending",
          published: false,
          created_by: userId,
        }));
      if (!rows.length) throw new Error("Nothing to create.");
      // Route through compliance-gated server fn (raises open flags per bundle).
      const { insertScheduledShiftsGated } = await import("@/lib/scheduling/shift-commit.functions");
      const res = await insertScheduledShiftsGated({ data: { rows: rows as never } });
      if (res.status === "needs_review") {
        throw new Error(`${res.candidates.length} compliance flag(s) require review before NECTAR can create these shifts. Open the Flags panel.`);
      }
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} draft shift${n === 1 ? "" : "s"} created by NECTAR.`);
      qc.invalidateQueries({ queryKey: ["shifts", orgId] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleApprove() {
    setSubmitting(true);
    try {
      await createMut.mutateAsync();
    } finally {
      setSubmitting(false);
    }
  }

  const loading = assignmentsQ.isLoading || profilesQ.isLoading || existingQ.isLoading;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            NECTAR Auto-assign Preview
          </DialogTitle>
          <DialogDescription>
            Reviewing proposed draft shifts for{" "}
            <span className="font-medium text-foreground">{scopeLabel}</span>. Nothing
            is created until you approve below. Blocked rows are skipped.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="grid place-items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Calendar className="h-8 w-8 text-muted-foreground/40" />
            No clients in this scope to schedule.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 text-xs">
              <Badge className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="mr-1 h-3 w-3" /> {validCount} valid
              </Badge>
              {blockedCount > 0 && (
                <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {blockedCount} blocked
                </Badge>
              )}
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {proposals.map((p) => (
                <div
                  key={p.key}
                  className={`rounded-lg border p-3 ${
                    p.valid
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-amber-500/40 bg-amber-500/5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        {p.valid ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                        )}
                        {p.client.first_name} {p.client.last_name}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {p.startsAt.toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          ·{" "}
                          {p.startsAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          –
                          {p.endsAt.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {p.staffName ?? "— no staff —"}
                        </span>
                        {p.serviceCode && (
                          <span className="font-mono">
                            {p.serviceCode}{" "}
                            <span className="text-muted-foreground/70">
                              ({evvServiceLabel(p.serviceCode).replace(`${p.serviceCode} — `, "")})
                            </span>
                          </span>
                        )}
                        {p.client.physical_address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            <span className="max-w-[160px] truncate">
                              {p.client.physical_address}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {p.blockers.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                      {p.blockers.map((b) => (
                        <li key={b}>• {b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={submitting || validCount === 0 || loading}
            className="gap-2"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create {validCount} draft shift{validCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
