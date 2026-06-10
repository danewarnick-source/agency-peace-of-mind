import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, CalendarOff, ArrowLeftRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  useOrgScheduleRequests,
  decideTimeOff,
  approveSwap,
  denySwap,
  type SwapRequest,
  type TimeOffRequest,
} from "@/lib/schedule-requests";
import type { StaffRow } from "@/hooks/use-schedule-preview";

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}
function nameOf(id: string | null, staff: StaffRow[]): string {
  if (!id) return "—";
  return staff.find((s) => s.id === id)?.name ?? "Staff";
}

export function RequestsPanel({
  weekStart,
  staff,
}: {
  weekStart: Date;
  staff: StaffRow[];
}) {
  const { data } = useOrgScheduleRequests();
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d;
  }, [weekStart]);

  const pendingTimeOff = (data?.timeOff ?? []).filter((r) => r.status === "pending");
  const pendingSwaps = (data?.swaps ?? []).filter((r) => r.status === "pending");
  const outThisWeek = (data?.timeOff ?? []).filter((r) => {
    if (r.status !== "approved") return false;
    const s = new Date(r.start_date + "T00:00:00").getTime();
    const e = new Date(r.end_date + "T23:59:59").getTime();
    return s <= weekEnd.getTime() && e >= weekStart.getTime();
  });

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold">Needs your approval</h2>
          <Badge variant="secondary" className="text-[10px]">
            {pendingTimeOff.length + pendingSwaps.length}
          </Badge>
        </div>
        {pendingTimeOff.length + pendingSwaps.length === 0 ? (
          <p className="text-sm opacity-60">Nothing pending.</p>
        ) : (
          <ul className="space-y-2">
            {pendingTimeOff.map((r) => (
              <TimeOffRow key={r.id} req={r} staff={staff} />
            ))}
            {pendingSwaps.map((r) => (
              <SwapRow key={r.id} req={r} staff={staff} />
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <CalendarOff className="h-4 w-4 opacity-60" />
          <h2 className="font-semibold">Out this week</h2>
          <Badge variant="secondary" className="text-[10px]">{outThisWeek.length}</Badge>
        </div>
        {outThisWeek.length === 0 ? (
          <p className="text-sm opacity-60">Everyone available.</p>
        ) : (
          <ul className="space-y-2">
            {outThisWeek.map((r) => (
              <li key={r.id} className="rounded-md border p-2 text-sm">
                <div className="font-medium">{nameOf(r.staff_id, staff)}</div>
                <div className="text-xs opacity-70">
                  {fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.type.toUpperCase()}
                </div>
                {r.note && <div className="text-xs mt-1 opacity-80">{r.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TimeOffRow({ req, staff }: { req: TimeOffRequest; staff: StaffRow[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const decide = useMutation({
    mutationFn: async (d: "approved" | "denied") => {
      if (!user?.id) throw new Error("Sign in required.");
      await decideTimeOff(req, d, user.id);
    },
    onSuccess: () => {
      toast.success("Updated.");
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <li className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CalendarOff className="h-3.5 w-3.5 opacity-60" />
            <span className="font-medium text-sm">{nameOf(req.staff_id, staff)}</span>
            <Badge variant="outline" className="text-[10px]">{req.type.toUpperCase()}</Badge>
          </div>
          <div className="text-xs opacity-70 mt-0.5">
            {fmtDate(req.start_date)} – {fmtDate(req.end_date)}
          </div>
          {req.note && <div className="text-xs mt-1 opacity-80 truncate">{req.note}</div>}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="outline" disabled={decide.isPending}
            onClick={() => decide.mutate("approved")} className="min-h-[32px] h-8 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" disabled={decide.isPending}
            onClick={() => decide.mutate("denied")} className="min-h-[32px] h-8 text-xs">
            <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
          </Button>
        </div>
      </div>
    </li>
  );
}

function SwapRow({ req, staff }: { req: SwapRequest; staff: StaffRow[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [pickedTo, setPickedTo] = useState<string>(req.to_staff_id ?? "");

  // Load shift details once so we can call saveShift via approveSwap.
  const { data: shift } = useQuery({
    queryKey: ["swap-shift", req.shift_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scheduled_shifts")
        .select("id, client_id, job_code, shift_type, starts_at, ends_at, status, published, organization_id")
        .eq("id", req.shift_id)
        .eq("organization_id", req.organization_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sign in required.");
      if (!shift) throw new Error("Shift not loaded yet.");
      const to = pickedTo || req.to_staff_id;
      if (!to) throw new Error("Pick who is taking the shift first.");
      await approveSwap(req, to, {
        client_id: shift.client_id as string,
        job_code: (shift.job_code as string | null) ?? null,
        shift_type: shift.shift_type as string,
        starts_at: shift.starts_at as string,
        ends_at: shift.ends_at as string,
        status: shift.status as string,
        published: shift.published as boolean,
      }, user.id);
    },
    onSuccess: () => {
      toast.success("Swap approved and shift reassigned.");
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      qc.invalidateQueries({ queryKey: ["schedule-preview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deny = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Sign in required.");
      await denySwap(req, user.id);
    },
    onSuccess: () => {
      toast.success("Denied.");
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const range = shift
    ? `${new Date(shift.starts_at as string).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : "Loading shift…";

  return (
    <li className="rounded-md border p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-3.5 w-3.5 opacity-60" />
            <span className="font-medium text-sm truncate">
              {nameOf(req.from_staff_id, staff)} → {req.to_staff_id ? nameOf(req.to_staff_id, staff) : "open swap"}
            </span>
          </div>
          <div className="text-xs opacity-70 mt-0.5">{range}</div>
          {req.note && <div className="text-xs mt-1 opacity-80 truncate">{req.note}</div>}
          {!req.to_staff_id && (
            <div className="mt-2">
              <Select value={pickedTo} onValueChange={setPickedTo}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign to…" /></SelectTrigger>
                <SelectContent>
                  {staff.filter((s) => s.id !== req.from_staff_id).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="sm" variant="outline" disabled={approve.isPending || !shift}
            onClick={() => approve.mutate()} className="min-h-[32px] h-8 text-xs">
            {approve.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={deny.isPending}
            onClick={() => deny.mutate()} className="min-h-[32px] h-8 text-xs">
            <XCircle className="h-3.5 w-3.5 mr-1" /> Deny
          </Button>
        </div>
      </div>
    </li>
  );
}
