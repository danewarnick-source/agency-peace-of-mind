import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Upload, X, Check, Loader2, AlertTriangle, ArrowLeftRight, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { supabase } from "@/integrations/supabase/client";
import {
  proposeSchedulingActions,
  proposeScheduleImport,
  type NectarProposal,
  type ProposedAction,
} from "@/lib/nectar-schedule-actions.functions";
import { saveShift } from "@/lib/schedule-preview-mutations";
import { isDailyServiceCode, isDayProgramCode } from "@/lib/service-billing";
import type { ClientRow, StaffRow, TeamRow, ShiftRow } from "@/hooks/use-schedule-preview";
import { useAllClientBillingCodes } from "@/hooks/use-client-billing-codes";
import { SCHED } from "./sched-ui";

const EXAMPLES = [
  "Cover the Maple house this week",
  "Mark Shandi off Thursday through Saturday",
  "Fill Oak's Wednesday overnight",
];

const TEAL = "#137182";
const GOLD = "#f5a623";

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function NectarCommandBar({
  weekStart,
  clients,
  staff,
  teams,
  shifts,
}: {
  weekStart: Date;
  clients: ClientRow[];
  staff: StaffRow[];
  teams: TeamRow[];
  shifts: ShiftRow[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? "";
  const propose = useServerFn(proposeSchedulingActions);
  const proposeImport = useServerFn(proposeScheduleImport);

  const [sentence, setSentence] = useState("");
  const [proposal, setProposal] = useState<NectarProposal | null>(null);
  const [askedSentence, setAskedSentence] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [showExamples, setShowExamples] = useState(false);

  // client_billing_codes as single source of truth for schedulable codes.
  // Day-program codes (DSG/DSP/DSI) are excluded — they are scheduled through
  // the day-program module, not the standard shift auto-assign flow.
  const allBillingCodesQ = useAllClientBillingCodes();
  const schedulableCodesByClient = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of allBillingCodesQ.data ?? []) {
      if (isDayProgramCode(row.service_code)) continue;
      if (!map.has(row.client_id)) map.set(row.client_id, []);
      map.get(row.client_id)!.push(row.service_code);
    }
    return map;
  }, [allBillingCodesQ.data]);

  const context = useMemo(() => {
    const teamById = new Map(teams.map((t) => [t.id, t.team_name] as const));
    return {
      week_start_iso: weekStart.toISOString(),
      teams: teams.map((t) => ({ id: t.id, name: t.team_name })),
      clients: clients.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        team_id: c.team_id,
        team_name: c.team_id ? teamById.get(c.team_id) ?? null : null,
        schedulable_codes: schedulableCodesByClient.get(c.id) ?? [],
      })),
      staff: staff.map((s) => ({ id: s.id, name: s.name })),
      shifts: shifts.filter((s) => s.staff_id && s.client_id).map((s) => ({
        id: s.id,
        client_id: s.client_id!,
        staff_id: s.staff_id!,
        job_code: s.job_code,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
      })),
    };
  }, [weekStart, clients, staff, teams, shifts, schedulableCodesByClient]);

  const emptyContext = clients.length === 0 || staff.length === 0;
  const emptyReason =
    clients.length === 0 && staff.length === 0
      ? "No clients or staff are loaded for this week — NECTAR has nothing to schedule against."
      : clients.length === 0
        ? "No clients are loaded for this week — NECTAR needs at least one client to draft a shift."
        : "No staff are loaded for this week — NECTAR needs at least one staff member to draft a shift.";

  const ask = useMutation({
    mutationFn: async (overrideSentence?: string) => {
      if (emptyContext) throw new Error(emptyReason);
      const s = (overrideSentence ?? sentence).trim();
      const result = await propose({ data: { ...context, sentence: s } });
      return { result: result as NectarProposal, askedWith: s };
    },
    onSuccess: ({ result, askedWith }) => {
      setProposal(result);
      setAskedSentence(askedWith);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const answerAsk = (label: string) => {
    const base = askedSentence || sentence;
    if (!base.trim()) return;
    ask.mutate(`${base}\n\nAnswer: ${label}`);
  };

  const replyWithText = () => {
    if (askedSentence) setSentence(askedSentence);
    setProposal(null);
  };

  const importMut = useMutation({
    mutationFn: async () => {
      if (emptyContext) throw new Error(emptyReason);
      const result = await proposeImport({ data: { ...context, raw_text: importText } });
      return result as NectarProposal;
    },
    onSuccess: (p) => { setProposal(p); setImportOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: async (actions: ProposedAction[]) => {
      if (!orgId || !user?.id) throw new Error("Sign in required.");
      // Apply sequentially; reuse Phase 2 saveShift for create + edit + reassign.
      // For reassign/edit we must read the current shift row first because saveShift
      // requires the full payload (it does an UPDATE of all editable columns).
      const shiftById = new Map(shifts.map((s) => [s.id, s] as const));
      let okCount = 0;
      const errs: string[] = [];
      for (const a of actions) {
        try {
          if (a.op === "create") {
            await saveShift({
              organization_id: orgId,
              staff_id: a.staff_id,
              client_id: a.client_id,
              job_code: a.job_code,
              service_code: a.job_code,
              shift_type: isDailyServiceCode(a.job_code) ? "daily_host_home" : "hourly",
              starts_at: a.starts_at,
              ends_at: a.ends_at,
              notes: a.reason || null,
              status: "pending",
              published: false,
              created_by: user.id,
            });
          } else if (a.op === "reassign") {
            const cur = shiftById.get(a.shift_id);
            if (!cur) throw new Error("Shift no longer exists");
            await saveShift({
              id: cur.id,
              organization_id: orgId,
              staff_id: a.to_staff_id,
              client_id: cur.client_id!,
              job_code: cur.job_code ?? "",
              service_code: cur.service_code ?? cur.job_code ?? "",
              shift_type: cur.shift_type ?? "hourly",
              starts_at: cur.starts_at,
              ends_at: cur.ends_at,
              notes: null,
              status: cur.status ?? "pending",
              published: !!cur.published,
              created_by: user.id,
            });
          } else {
            const cur = shiftById.get(a.shift_id);
            if (!cur) throw new Error("Shift no longer exists");
            const job = a.patch.job_code ?? cur.job_code ?? "";
            await saveShift({
              id: cur.id,
              organization_id: orgId,
              staff_id: cur.staff_id!,
              client_id: cur.client_id!,
              job_code: job,
              service_code: job,
              shift_type: isDailyServiceCode(job) ? "daily_host_home" : "hourly",
              starts_at: a.patch.starts_at ?? cur.starts_at,
              ends_at: a.patch.ends_at ?? cur.ends_at,
              notes: null,
              status: cur.status ?? "pending",
              published: !!cur.published,
              created_by: user.id,
            });
          }
          okCount++;
        } catch (e) {
          errs.push((e as Error).message);
        }
      }
      return { okCount, errs };
    },
    onSuccess: ({ okCount, errs }) => {
      if (okCount) toast.success(`${okCount} change${okCount === 1 ? "" : "s"} applied.`);
      if (errs.length) toast.error(`${errs.length} failed: ${errs[0]}`);
      qc.invalidateQueries({ queryKey: ["schedule-preview"] });
      setProposal(null);
      setSentence("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div style={{ marginTop: 14, marginBottom: 14, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <style>{`.nbar-input::placeholder{color:#8b93b0}`}</style>
      {/* Navy NECTAR command bar (matches HIVE-Schedule-Demo-v6) */}
      <div style={{ display: "flex", gap: 9, alignItems: "center", background: SCHED.navy, borderRadius: 12, padding: "8px 8px 8px 14px" }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: SCHED.gold, display: "grid", placeItems: "center", color: SCHED.navy, fontWeight: 800, fontSize: 13, flex: "none" }}>✦</span>
        <input
          className="nbar-input"
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && sentence.trim()) ask.mutate(undefined); }}
          placeholder='Ask NECTAR — “cover Maple this week”, “Shandi off Thu–Sat”, “fill Oak’s Wed overnight”'
          disabled={ask.isPending}
          style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 14, fontFamily: "inherit", minWidth: 0 }}
        />
        <button onClick={() => setShowExamples((s) => !s)} style={{ background: "transparent", border: "none", color: "#aeb6cf", fontSize: 12, fontWeight: 600, flex: "none", padding: "0 6px", cursor: "pointer" }}>
          Examples
        </button>
        <button
          onClick={() => ask.mutate(undefined)}
          disabled={ask.isPending || !sentence.trim()}
          style={{ background: SCHED.gold, color: SCHED.navy, border: "none", borderRadius: 9, padding: "8px 15px", fontWeight: 700, fontSize: 13, flex: "none", cursor: "pointer", opacity: ask.isPending || !sentence.trim() ? 0.6 : 1, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Draft it
        </button>
      </div>

      {showExamples && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => { setSentence(ex); setShowExamples(false); }}
              style={{ background: "#fff", border: `1px solid ${SCHED.line}`, borderRadius: 99, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, color: SCHED.ink, cursor: "pointer" }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <p style={{ margin: 0, fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", color: SCHED.muted }}>
          Advisory only — proposals are reviewed before any shift is saved.
        </p>
        {emptyContext && (
          <p style={{ margin: 0, fontSize: 12, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "4px 8px" }}>
            {emptyReason}
          </p>
        )}
        <button
          onClick={() => setImportOpen(true)}
          style={{
            background: "#0B1126",
            border: "1px solid #f5a623",
            boxShadow: "inset 0 0 0 1px rgba(245,166,35,0.25)",
            borderRadius: 9,
            padding: "6px 11px",
            fontSize: 12.5,
            fontWeight: 600,
            color: "#ffffff",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Upload className="h-3.5 w-3.5" /> Import a schedule
        </button>
      </div>

      {proposal && (
        <ProposalReview
          proposal={proposal}
          onDiscard={() => setProposal(null)}
          onApprove={() => proposal.kind === "ok" && apply.mutate(proposal.actions)}
          applying={apply.isPending}
          onAnswer={answerAsk}
          onReplyWithText={replyWithText}
          answering={ask.isPending}
        />
      )}

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        text={importText}
        setText={setImportText}
        onSubmit={() => importMut.mutate()}
        pending={importMut.isPending}
      />
    </div>
  );
}

function ProposalReview({
  proposal, onDiscard, onApprove, applying, onAnswer, onReplyWithText, answering,
}: {
  proposal: NectarProposal;
  onDiscard: () => void;
  onApprove: () => void;
  applying: boolean;
  onAnswer: (label: string) => void;
  onReplyWithText: () => void;
  answering: boolean;
}) {
  if (proposal.kind === "ask") {
    const replyType = proposal.reply_type ?? (proposal.options?.length ? "options" : "text");
    const yesNo: { id: string; label: string }[] = [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ];
    const choices =
      replyType === "yes_no" ? yesNo :
      replyType === "options" ? (proposal.options ?? []) :
      [];
    return (
      <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-amber-900">NECTAR needs more info:</p>
            <p className="text-amber-800 mt-0.5">{proposal.question}</p>
            {choices.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {choices.map((opt) => {
                  const isYes = replyType === "yes_no" && opt.id === "yes";
                  return (
                    <Button
                      key={opt.id}
                      size="sm"
                      variant={isYes ? "default" : "outline"}
                      disabled={answering}
                      onClick={() => onAnswer(opt.label)}
                      style={isYes ? { background: TEAL, color: "white" } : undefined}
                    >
                      {answering ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={onReplyWithText}
              disabled={answering}
              className="mt-2 text-xs font-medium text-amber-900 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Reply with text…
            </button>
          </div>
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={answering}><X className="h-4 w-4" /></Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-md border-2 border-dashed p-3" style={{ borderColor: GOLD, background: "rgba(245,166,35,0.05)" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge style={{ background: GOLD, color: "white" }}>DRAFT</Badge>
          <span className="text-sm font-medium truncate">{proposal.summary}</span>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" onClick={onDiscard} disabled={applying}>
            <X className="h-4 w-4 mr-1" /> Discard
          </Button>
          <Button size="sm" onClick={onApprove} disabled={applying || proposal.actions.length === 0}
            style={{ background: TEAL, color: "white" }}>
            {applying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
            Approve & apply
          </Button>
        </div>
      </div>
      <ul className="space-y-1 max-h-72 overflow-y-auto">
        {proposal.actions.map((a, i) => <ActionRow key={i} a={a} />)}
      </ul>
      {proposal.unmatched.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">
            {proposal.unmatched.length} unmatched — won't be applied
          </summary>
          <ul className="mt-1 space-y-1 text-xs">
            {proposal.unmatched.map((u, i) => (
              <li key={i} className="text-muted-foreground">
                <span className="font-medium">{u.reason}</span>: <span className="opacity-70">{u.line.slice(0, 120)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ActionRow({ a }: { a: ProposedAction }) {
  const Icon = a.op === "create" ? Plus : a.op === "reassign" ? ArrowLeftRight : Pencil;
  const tint = a.op === "create" ? TEAL : a.op === "reassign" ? GOLD : "#666";
  return (
    <li className="flex items-start gap-2 rounded-md bg-white border p-2 text-xs">
      <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: tint }} />
      <div className="min-w-0 flex-1">
        {a.op === "create" && (
          <>
            <div className="font-medium">
              New: {a.staff_name} → {a.client_name}
              {a.team_name && <span className="opacity-60"> · {a.team_name}</span>}
            </div>
            <div className="opacity-70">
              {a.job_code} · {fmtWhen(a.starts_at)} – {fmtWhen(a.ends_at)}
            </div>
          </>
        )}
        {a.op === "reassign" && (
          <>
            <div className="font-medium">Reassign: {a.from_staff_name} → {a.to_staff_name}</div>
            {a.reason && <div className="opacity-70">{a.reason}</div>}
          </>
        )}
        {a.op === "edit" && (
          <>
            <div className="font-medium">
              Edit: {a.staff_name} → {a.client_name}
              <span className="opacity-60"> · {fmtWhen(a.current.starts_at).split(",")[0]}</span>
            </div>
            <div className="opacity-70 space-y-0.5">
              {a.patch.starts_at && (
                <div>Start: {fmtWhen(a.current.starts_at)} → {fmtWhen(a.patch.starts_at)}</div>
              )}
              {a.patch.ends_at && (
                <div>End: {fmtWhen(a.current.ends_at)} → {fmtWhen(a.patch.ends_at)}</div>
              )}
              {a.patch.job_code && (
                <div>Code: {a.current.job_code ?? "—"} → {a.patch.job_code}</div>
              )}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

function ImportDialog({
  open, onOpenChange, text, setText, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  text: string;
  setText: (s: string) => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import schedule</DialogTitle>
          <DialogDescription>
            Paste CSV or a tabular export from another scheduler. NECTAR will map columns to staff, client, code, and times. You'll review before anything is saved.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <Input
            type="file"
            accept=".csv,.tsv,.txt"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const text = await f.text();
              setText(text);
            }}
          />
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="staff_name,client_name,code,start,end&#10;Sarah Chen,Maple Johnny,DSI,2026-06-15 09:00,2026-06-15 13:00"
            className="font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSubmit} disabled={pending || !text.trim()} style={{ background: TEAL, color: "white" }}>
            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Parse with NECTAR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
