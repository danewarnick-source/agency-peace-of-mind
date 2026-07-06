/**
 * Held Timesheets — supervisor queue for EVV clock-outs that hit a confirmed
 * billing_conflict rule. Staff-preserved punches surface here for
 * admin/manager review. One action both resolves the open flag(s) AND
 * runs the billable finalize (or stops, keeping the punch un-billed).
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listHeldTimesheets,
  resolveHeldTimesheet,
  resolveClockInHold,
  type HeldTimesheetRow,
} from "@/lib/nectar-held-timesheets.functions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Clock, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/use-permissions";

const HELD_KEY = (orgId: string) => ["held-timesheets", orgId] as const;

/** Hook: list of held timesheets. `.length` = badge count. */
export function useHeldTimesheets(organizationId: string | undefined) {
  const listFn = useServerFn(listHeldTimesheets);
  return useQuery({
    enabled: !!organizationId,
    queryKey: HELD_KEY(organizationId ?? ""),
    queryFn: async () => {
      const rows = (await listFn({ data: { organizationId: organizationId! } })) as HeldTimesheetRow[];
      return rows;
    },
  });
}

export function HeldTimesheetsBadge({ organizationId }: { organizationId: string | undefined }) {
  const { data } = useHeldTimesheets(organizationId);
  const n = data?.length ?? 0;
  if (n === 0) return null;
  return (
    <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
      {n}
    </Badge>
  );
}

export function HeldTimesheetsPanel({ organizationId }: { organizationId: string }) {
  const { role, isLoading: roleLoading } = usePermissions();
  const canResolve = role === "admin" || role === "manager" || role === "super_admin";
  const { data: rows, isLoading, error } = useHeldTimesheets(organizationId);
  const [reviewing, setReviewing] = useState<HeldTimesheetRow | null>(null);

  if (roleLoading || isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading held timesheets…
        </CardContent>
      </Card>
    );
  }

  if (!canResolve) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">
          Only admins and managers can review held timesheets.
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-destructive">
          Could not load held timesheets: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  const list = rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            Held timesheets awaiting compliance review
            <Badge variant={list.length > 0 ? "destructive" : "outline"}>{list.length}</Badge>
          </CardTitle>
          <CardDescription>
            EVV clock-outs held by a confirmed billing-conflict rule. Staff punches are
            preserved but not billable-committed until a supervisor resolves the flag.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.length === 0 ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> No held timesheets. All clear.
            </div>
          ) : (
            list.map((row) => (
              <div
                key={row.timesheet_id}
                className="rounded-md border bg-card p-3 space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <div className="font-medium">
                      {row.staff_name ?? "Unknown staff"} · {row.client_name ?? "Unknown client"}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span>{row.service_date}</span>
                      <span>·</span>
                      <span className="font-mono">{row.service_type_code ?? "—"}</span>
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      <span>held {new Date(row.held_at).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {Array.from(new Set(row.flags.flatMap((f) => f.matched_codes))).map((c) => (
                        <Badge key={c} variant="outline" className="text-[10px] font-mono">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setReviewing(row)}>
                    Review
                  </Button>
                </div>
                {row.flags[0]?.source.verbatim && (
                  <blockquote className="pl-3 border-l-2 border-amber-500 text-xs italic text-muted-foreground line-clamp-2">
                    "{row.flags[0].source.verbatim}"
                  </blockquote>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {reviewing && (
        <ResolveHeldDialog
          organizationId={organizationId}
          row={reviewing}
          onOpenChange={(v) => !v && setReviewing(null)}
        />
      )}
    </div>
  );
}

function ResolveHeldDialog({
  organizationId,
  row,
  onOpenChange,
}: {
  organizationId: string;
  row: HeldTimesheetRow;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const resolveFn = useServerFn(resolveHeldTimesheet);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async (decision: "acknowledge_and_finalize" | "stop") => {
      if (!note.trim()) throw new Error("A resolution note is required.");
      return resolveFn({
        data: {
          organizationId,
          timesheetId: row.timesheet_id,
          decision,
          note: note.trim(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    },
    onSuccess: (res) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = res as any;
      if (r?.finalized) {
        toast.success(`Finalized. ${r.flagsResolved} flag(s) resolved, ${r.billedUnits} units billed.`);
      } else {
        toast.success(`Stopped. ${r?.flagsResolved ?? 0} flag(s) resolved. Timesheet remains un-billed.`);
      }
      qc.invalidateQueries({ queryKey: HELD_KEY(organizationId) });
      qc.invalidateQueries({ queryKey: ["compliance-flags"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Review held timesheet
          </DialogTitle>
          <DialogDescription>
            NECTAR flags; you decide. Acknowledging resolves the flag and finalizes the
            billable commit in one action. Stopping resolves the flag and keeps the
            timesheet un-billed for correction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div><span className="text-muted-foreground">Staff:</span> {row.staff_name ?? "—"}</div>
            <div><span className="text-muted-foreground">Client:</span> {row.client_name ?? "—"}</div>
            <div><span className="text-muted-foreground">Service date:</span> {row.service_date} · <span className="font-mono">{row.service_type_code}</span></div>
            <div className="text-xs text-muted-foreground">
              Clock-in {new Date(row.clock_in_timestamp).toLocaleString()} → Clock-out {new Date(row.clock_out_timestamp).toLocaleString()}
            </div>
          </div>

          {row.flags.map((f) => (
            <div key={f.id} className="rounded-md border p-3 bg-card space-y-2">
              <div className="text-sm">
                <span className="font-medium">Source states:</span>
                <blockquote className="mt-1 pl-3 border-l-2 border-amber-500 italic text-muted-foreground">
                  "{f.source.verbatim}"
                </blockquote>
                {f.source.citation && (
                  <div className="text-xs text-muted-foreground mt-1">— {f.source.citation}</div>
                )}
              </div>
              <div className="flex gap-1 flex-wrap">
                {f.matched_codes.map((c) => (
                  <Badge key={c} variant="outline" className="text-xs font-mono">{c}</Badge>
                ))}
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Raised {new Date(f.raised_at).toLocaleString()}
              </div>
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-sm font-medium">Resolution note <span className="text-destructive">*</span></label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the decision (audit trail)."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            onClick={() => mutation.mutate("stop")}
            disabled={mutation.isPending}
          >
            Stop &amp; keep un-billed
          </Button>
          <Button
            onClick={() => mutation.mutate("acknowledge_and_finalize")}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Acknowledge &amp; finalize
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
