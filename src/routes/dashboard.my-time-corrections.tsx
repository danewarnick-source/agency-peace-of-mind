// Staff-facing status view for time-correction requests they've submitted
// from the Submit Final Timesheet screen. Read-only: this page shows the
// current staff member's own evv_timesheets rows where they submitted a
// correction (edit_reason set + review_status one of the review states).
// RLS on evv_timesheets restricts staff to their own rows; the query below
// additionally scopes by staff_id = auth user id defensively.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, CheckCircle2, XCircle, Loader2, Info, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Badge } from "@/components/ui/badge";
import { ManualTimesheetDialog } from "@/components/records/manual-timesheet-dialog";

export const Route = createFileRoute("/dashboard/my-time-corrections")({
  head: () => ({ meta: [{ title: "My time corrections — HIVE" }] }),
  component: MyTimeCorrectionsPage,
});

type Row = {
  id: string;
  service_type_code: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string | null;
  corrected_clock_in: string | null;
  corrected_clock_out: string | null;
  edit_reason: string | null;
  review_status: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  edited_at: string | null;
  clients: { first_name: string | null; last_name: string | null } | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : "—";
}

function statusBadge(s: string | null) {
  const v = (s ?? "").toLowerCase();
  if (v === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
        <CheckCircle2 className="mr-1 h-3 w-3" /> Approved — corrected times now bill
      </Badge>
    );
  }
  if (v === "rejected") {
    return (
      <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
        <XCircle className="mr-1 h-3 w-3" /> Denied — original times stand
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
      <Timer className="mr-1 h-3 w-3" /> Pending supervisor review
    </Badge>
  );
}

function MyTimeCorrectionsPage() {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["my-time-corrections", user?.id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("evv_timesheets")
        .select(
          "id, service_type_code, clock_in_timestamp, clock_out_timestamp, corrected_clock_in, corrected_clock_out, edit_reason, review_status, review_note, reviewed_at, edited_at, clients:client_id(first_name,last_name)",
        )
        .eq("staff_id", user!.id)
        .not("edit_reason", "is", null)
        .in("review_status", ["needs_review", "approved", "rejected"])
        .order("edited_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = q.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-700" />
            <h1 className="text-xl font-semibold">My time corrections</h1>
          </div>
          {org?.organization_id && user?.id && (
            <ManualTimesheetDialog
              mode="staff"
              organizationId={org.organization_id}
              currentStaffId={user.id}
            />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Every time-correction request you submit from the Submit Final Timesheet screen shows up here with its current status. When a supervisor approves, the corrected times replace the recorded times for billing; if denied, you'll see their note explaining why.
        </p>
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Only you can see your own list. The recorded (original) clock-in/clock-out are always preserved on the record — corrections live alongside them. Forgot to clock in or out entirely? Use "Log a missed timesheet" above.</span>
        </div>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your correction requests…
        </div>
      )}

      {q.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load your correction requests: {(q.error as Error).message}
        </div>
      )}

      {!q.isLoading && !q.isError && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          You haven't submitted any time-correction requests yet.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {[r.clients?.first_name, r.clients?.last_name].filter(Boolean).join(" ") || "Client"}
                  </span>
                  {r.service_type_code && (
                    <Badge variant="outline" className="font-mono text-[10px]">{r.service_type_code}</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  Submitted {fmt(r.edited_at)}
                  {r.reviewed_at ? ` · Reviewed ${fmt(r.reviewed_at)}` : ""}
                </div>
              </div>
              {statusBadge(r.review_status)}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Original (recorded)</p>
                <p className="mt-1 font-mono text-xs">In: {fmt(r.clock_in_timestamp)}</p>
                <p className="font-mono text-xs">Out: {fmt(r.clock_out_timestamp)}</p>
              </div>
              <div className="rounded-lg border border-amber-400/50 bg-amber-50/40 p-2.5 dark:bg-amber-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  You requested
                </p>
                <p className="mt-1 font-mono text-xs">In: {fmt(r.corrected_clock_in ?? r.clock_in_timestamp)}</p>
                <p className="font-mono text-xs">Out: {fmt(r.corrected_clock_out)}</p>
              </div>
            </div>

            {r.edit_reason && (
              <div className="rounded-lg border border-border bg-card p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Your reason</p>
                <p className="mt-1 text-xs leading-relaxed">{r.edit_reason}</p>
              </div>
            )}

            {(r.review_status ?? "").toLowerCase() === "rejected" && r.review_note && (
              <div className="rounded-lg border border-rose-400/50 bg-rose-50/40 p-2.5 dark:bg-rose-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Reviewer's note
                </p>
                <p className="mt-1 text-xs leading-relaxed">{r.review_note}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
