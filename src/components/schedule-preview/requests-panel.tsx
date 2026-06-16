import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ChevronRight, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import {
  useOrgScheduleRequests,
  decideTimeOff,
  approveSwap,
  denySwap,
  fetchConflictingShifts,
  type SwapRequest,
  type TimeOffRequest,
} from "@/lib/schedule-requests";
import type { StaffRow } from "@/hooks/use-schedule-preview";
import { SCHED } from "./sched-ui";

// ── tokens / small style helpers (ported from the demo weekstrip) ─────
const wcard: React.CSSProperties = { background: "#fff", border: `1px solid ${SCHED.line}`, borderRadius: 14, boxShadow: SCHED.shadow, overflow: "hidden" };
const wh: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: `1px solid ${SCHED.line}` };
const wbody: React.CSSProperties = { padding: "6px 14px 10px", maxHeight: 260, overflow: "auto" };
const wrow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: `1px solid #f0f1f6` };
const av: React.CSSProperties = { width: 28, height: 28, borderRadius: "50%", background: SCHED.teal, color: "#fff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11, flex: "none" };
const info: React.CSSProperties = { flex: 1, minWidth: 0 };
const infoB: React.CSSProperties = { fontSize: 13, fontWeight: 700, display: "block" };
const infoS: React.CSSProperties = { display: "block", color: SCHED.muted, fontSize: 12 };
const acts: React.CSSProperties = { display: "flex", gap: 6, flex: "none" };
const wbtn: React.CSSProperties = { border: `1px solid ${SCHED.line}`, background: "#fff", borderRadius: 8, padding: "6px 9px", fontWeight: 700, fontSize: 11.5, cursor: "pointer" };
const wbtnOk: React.CSSProperties = { ...wbtn, background: SCHED.ok, borderColor: SCHED.ok, color: "#fff" };
const wempty: React.CSSProperties = { color: SCHED.muted, textAlign: "center", padding: "22px 8px", fontWeight: 500, fontSize: 12.5 };

function cnt(calm: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 800, borderRadius: 99, padding: "2px 9px", ...(calm ? { background: SCHED.tealBg, color: "#0c5562" } : { background: SCHED.gapBg, color: SCHED.gap }) };
}
function tagStyle(kind: "pto" | "sick" | "swap"): React.CSSProperties {
  const base: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flex: "none" };
  if (kind === "sick") return { ...base, background: SCHED.warnBg, color: SCHED.warn };
  if (kind === "swap") return { ...base, background: SCHED.purpleBg, color: "#463b7e" };
  return { ...base, background: SCHED.tealBg, color: "#0c5562" };
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function nameOf(id: string | null, staff: StaffRow[]): string {
  if (!id) return "—";
  return staff.find((s) => s.id === id)?.name ?? "Staff";
}
function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}
function isSick(t: string): boolean {
  const v = (t || "").toLowerCase();
  return v.includes("sick") || v.includes("medical");
}

export function RequestsPanel({ weekStart, staff }: { weekStart: Date; staff: StaffRow[] }) {
  const { data } = useOrgScheduleRequests();
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);

  const pendingTimeOff = (data?.timeOff ?? []).filter((r) => r.status === "pending");
  const pendingSwaps = (data?.swaps ?? []).filter((r) => r.status === "pending");
  const outThisWeek = (data?.timeOff ?? []).filter((r) => {
    if (r.status !== "approved") return false;
    const s = new Date(r.start_date + "T00:00:00").getTime();
    const e = new Date(r.end_date + "T23:59:59").getTime();
    return s <= weekEnd.getTime() && e >= weekStart.getTime();
  });
  const pendingCount = pendingTimeOff.length + pendingSwaps.length;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }} className="sched-weekstrip">
      <style>{`@media(max-width:760px){.sched-weekstrip{grid-template-columns:1fr!important}}`}</style>

      <div style={wcard}>
        <div style={wh}>
          <b style={{ fontSize: 13.5, fontWeight: 800 }}>Needs your approval</b>
          <span style={cnt(pendingCount === 0)}>{pendingCount}</span>
        </div>
        <div style={wbody}>
          {pendingCount === 0 ? (
            <div style={wempty}><div style={{ fontSize: 26, marginBottom: 5 }}>✓</div>All caught up — no pending requests</div>
          ) : (
            <>
              {pendingTimeOff.map((r, i) => <TimeOffRow key={r.id} req={r} staff={staff} first={i === 0} />)}
              {pendingSwaps.map((r) => <SwapRow key={r.id} req={r} staff={staff} />)}
            </>
          )}
        </div>
      </div>

      <div style={wcard}>
        <div style={wh}>
          <b style={{ fontSize: 13.5, fontWeight: 800 }}>Out this week</b>
          <span style={cnt(true)}>{outThisWeek.length}</span>
        </div>
        <div style={wbody}>
          {outThisWeek.length === 0 ? (
            <div style={wempty}>Everyone available this week</div>
          ) : (
            outThisWeek.map((r, i) => {
              const name = nameOf(r.staff_id, staff);
              return (
                <div key={r.id} style={{ ...wrow, ...(i === 0 ? { borderTop: "none" } : null) }}>
                  <span style={av}>{initials(name)}</span>
                  <div style={info}>
                    <b style={infoB}>{name}</b>
                    <span style={infoS}>{fmtDate(r.start_date)} – {fmtDate(r.end_date)} · {r.type.toUpperCase()}</span>
                  </div>
                  <span style={tagStyle(isSick(r.type) ? "sick" : "pto")}>Off</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function TimeOffRow({ req, staff, first }: { req: TimeOffRequest; staff: StaffRow[]; first: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data: conflicts } = useQuery({
    queryKey: ["time-off-conflicts", req.id, req.staff_id, req.start_date, req.end_date],
    queryFn: () => fetchConflictingShifts(req.organization_id, req.staff_id, req.start_date, req.end_date),
  });
  const conflictCount = conflicts?.length ?? 0;

  const decide = useMutation({
    mutationFn: async (d: "approved" | "denied") => {
      if (!user?.id) throw new Error("Sign in required.");
      if (d === "approved" && conflictCount > 0) {
        const ok = window.confirm(
          `This staff member has ${conflictCount} published shift${conflictCount === 1 ? "" : "s"} during these dates. Approve anyway? The shifts will need to be reassigned manually.`,
        );
        if (!ok) return;
      }
      await decideTimeOff(req, d, user.id);
    },
    onSuccess: () => { toast.success("Updated."); qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const name = nameOf(req.staff_id, staff);
  return (
    <div style={{ ...wrow, ...(first ? { borderTop: "none" } : null), flexWrap: "wrap" }}>
      <span style={av}>{initials(name)}</span>
      <div style={info}>
        <b style={infoB}>{name}</b>
        <span style={infoS}>Time off · {fmtDate(req.start_date)} – {fmtDate(req.end_date)}{req.note ? ` · ${req.note}` : ""}</span>
        {conflictCount > 0 && (
          <span style={{ display: "block", marginTop: 4, fontSize: 11.5, fontWeight: 700, color: SCHED.warn }}>
            ⚠ Conflicts with {conflictCount} published shift{conflictCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
      <span style={tagStyle(isSick(req.type) ? "sick" : "pto")}>{req.type.toUpperCase()}</span>
      <div style={acts}>
        <button style={wbtnOk} disabled={decide.isPending} onClick={() => decide.mutate("approved")}>Approve</button>
        <button style={wbtn} disabled={decide.isPending} onClick={() => decide.mutate("denied")}>Deny</button>
      </div>
    </div>
  );
}

function SwapRow({ req, staff }: { req: SwapRequest; staff: StaffRow[] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [pickedTo, setPickedTo] = useState<string>(req.to_staff_id ?? "");

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
    onSuccess: () => { toast.success("Denied."); qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const fromName = nameOf(req.from_staff_id, staff);
  const toName = req.to_staff_id ? nameOf(req.to_staff_id, staff) : "open swap";
  const range = shift
    ? new Date(shift.starts_at as string).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Loading shift…";

  return (
    <div style={wrow}>
      <span style={{ ...av, background: SCHED.purple }}>⇄</span>
      <div style={info}>
        <b style={infoB}>Shift swap</b>
        <span style={infoS}>{fromName} → {toName} · {range}{req.note ? ` · ${req.note}` : ""}</span>
        {!req.to_staff_id && (
          <div style={{ marginTop: 6 }}>
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
      <span style={tagStyle("swap")}>Swap</span>
      <div style={acts}>
        <button style={wbtnOk} disabled={approve.isPending || !shift} onClick={() => approve.mutate()}>
          {approve.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve"}
        </button>
        <button style={wbtn} disabled={deny.isPending} onClick={() => deny.mutate()}>Deny</button>
      </div>
    </div>
  );
}
