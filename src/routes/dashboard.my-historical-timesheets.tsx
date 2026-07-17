// Stage 4 of the historical-timesheets import: the staff member's
// confirmation page. Each staff member sees ONLY entries the admin submitted
// to them from a historical spreadsheet import — they never see another
// staff member's rows, and they never see anything that hasn't been
// explicitly submitted to them (rows land here only after the admin's
// Stage 3 submit action).
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Flag, Loader2, Save, X, Archive, Info, Sparkles, Hexagon, Mic, MicOff, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { HistoricalTimesheetBadge } from "@/components/smart-import/timesheets/historical-timesheet-badge";
import { NectarInfusionLock } from "@/components/nectar/nectar-infusion-lock";
import { draftShiftNote } from "@/lib/ai-coach.functions";
import {
  listMyPendingHistoricalTimesheets,
  updateMyHistoricalTimesheetNote,
  flagMyHistoricalTimesheet,
  clearMyHistoricalTimesheetFlag,
  confirmMyHistoricalTimesheet,
} from "@/lib/historical-timesheet-confirmation.functions";

export const Route = createFileRoute("/dashboard/my-historical-timesheets")({
  head: () => ({ meta: [{ title: "Historical timesheets to confirm — HIVE" }] }),
  component: MyHistoricalTimesheetsPage,
});

type Row = {
  id: string;
  client_id: string;
  service_type_code: string | null;
  clock_in_timestamp: string;
  clock_out_timestamp: string;
  shift_note_text: string | null;
  staff_flagged: boolean;
  staff_flag_reason: string | null;
  import_job_id: string | null;
  clients: { id: string; first_name: string | null; last_name: string | null } | null;
};

function MyHistoricalTimesheetsPage() {
  const list = useServerFn(listMyPendingHistoricalTimesheets);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-historical-timesheets-pending"],
    queryFn: () => list(),
  });

  const rows = (q.data?.rows ?? []) as Row[];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-amber-700" />
          <h1 className="text-xl font-semibold">Historical timesheets to confirm</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          These are past clock-in/clock-out entries an admin brought over from another platform and submitted to you for
          confirmation. You're the only person seeing your own list — nobody else can see it. Add a shift note if one is
          missing, flag anything that looks wrong, and confirm each entry so it's finalized on your record.
        </p>
        <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground flex items-start gap-2">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Every entry stays permanently marked as a <em>historical import</em>. Confirming does not turn it into a live
            clock punch — it just tells the platform that the hours are accurate.
          </span>
        </div>
      </header>

      {q.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your entries…
        </div>
      )}

      {q.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Couldn't load your entries: {(q.error as Error).message}
        </div>
      )}

      {!q.isLoading && !q.isError && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
          You're all caught up — nothing waiting on your confirmation.
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => (
          <EntryCard key={r.id} row={r} onChanged={() => qc.invalidateQueries({ queryKey: ["my-historical-timesheets-pending"] })} />
        ))}
      </div>
    </div>
  );
}

function fmtRange(inIso: string, outIso: string): string {
  const inD = new Date(inIso);
  const outD = new Date(outIso);
  const date = inD.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const dur = Math.max(0, outD.getTime() - inD.getTime());
  const hrs = Math.floor(dur / 3_600_000);
  const mins = Math.round((dur % 3_600_000) / 60_000);
  return `${date} · ${t(inD)} – ${t(outD)}  (${hrs}h ${mins.toString().padStart(2, "0")}m)`;
}

function EntryCard({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [note, setNote] = useState(row.shift_note_text ?? "");
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState(row.staff_flag_reason ?? "");
  const [shorthand, setShorthand] = useState("");
  const [nectarDraft, setNectarDraft] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [nectarUsed, setNectarUsed] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const speechSupported = typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const draftFn = useServerFn(draftShiftNote);

  const updateNoteFn = useServerFn(updateMyHistoricalTimesheetNote);
  const flagFn = useServerFn(flagMyHistoricalTimesheet);
  const clearFlagFn = useServerFn(clearMyHistoricalTimesheetFlag);
  const confirmFn = useServerFn(confirmMyHistoricalTimesheet);

  const saveNote = useMutation({
    mutationFn: () => updateNoteFn({ data: { id: row.id, note } }),
    onSuccess: () => { toast.success("Shift note saved."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveFlag = useMutation({
    mutationFn: () => flagFn({ data: { id: row.id, reason: flagReason } }),
    onSuccess: () => { toast.success("Flagged for admin follow-up."); setFlagOpen(false); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearFlag = useMutation({
    mutationFn: () => clearFlagFn({ data: { id: row.id } }),
    onSuccess: () => { toast.success("Flag removed."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const confirmEntry = useMutation({
    mutationFn: () => confirmFn({ data: { id: row.id } }),
    onSuccess: () => { toast.success("Entry confirmed."); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const clientLabel = useMemo(() => {
    const c = row.clients;
    if (!c) return "Client";
    return [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Client";
  }, [row.clients]);

  const noteDirty = (note ?? "") !== (row.shift_note_text ?? "");
  const noteMissing = !(row.shift_note_text ?? "").trim() && !note.trim();

  function stopRecording() {
    try { recognitionRef.current?.stop?.(); } catch { /* ignore */ }
    setIsRecording(false);
  }
  function startRecording() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!Ctor) return;
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (ev: any) => {
        let txt = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          txt += ev.results[i][0].transcript;
        }
        setShorthand((s) => (s ? s + " " : "") + txt.trim());
      };
      rec.onerror = () => stopRecording();
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
      rec.start();
      setIsRecording(true);
    } catch {
      toast.error("Couldn't start voice input — please type instead.");
    }
  }
  useEffect(() => () => { try { recognitionRef.current?.stop?.(); } catch { /* ignore */ } }, []);

  async function runDraftWithNectar() {
    const text = shorthand.trim();
    if (text.length < 3) {
      toast.error("Add a few words of shorthand first (e.g. 'park, soda $2, calm all shift').");
      return;
    }
    stopRecording();
    setDraftBusy(true);
    try {
      const clientFirst = row.clients?.first_name?.trim() || "the client";
      const res = await draftFn({ data: { shorthand: text, goals: [], clientFirstName: clientFirst } });
      setNectarDraft(res.draft);
    } catch (e) {
      toast.error((e as Error).message || "NECTAR couldn't draft the note — please try again.");
    } finally {
      setDraftBusy(false);
    }
  }
  function acceptNectarDraft() {
    if (!nectarDraft) return;
    setNote(nectarDraft);
    setNectarUsed(true);
    setNectarDraft(null);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{clientLabel}</span>
            {row.service_type_code && (
              <span className="text-xs rounded bg-muted px-1.5 py-0.5">{row.service_type_code}</span>
            )}
            <HistoricalTimesheetBadge />
            {row.staff_flagged && (
              <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-destructive">
                <Flag className="h-3 w-3" /> Flagged
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{fmtRange(row.clock_in_timestamp, row.clock_out_timestamp)}</div>
        </div>
      </div>

      {noteMissing && (
        <NectarInfusionLock
          featureName="Draft with NECTAR"
          benefit="Turn quick shorthand (or a voice memo) into a compliant progress-note draft in seconds. You always review and confirm before it's saved."
        >
          <div className="rounded-lg border-2 border-dashed border-amber-400 bg-amber-50/60 px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              <Hexagon className="h-4 w-4 text-amber-700" />
              <div className="flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">NECTAR Infusion</div>
                <div className="text-sm font-semibold">Draft with NECTAR</div>
              </div>
            </div>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              This entry has no shift note. Jot quick shorthand or tap the mic — NECTAR expands it into a draft you review and confirm.
            </p>
            <Textarea
              rows={3}
              value={shorthand}
              onChange={(e) => setShorthand(e.target.value)}
              placeholder="e.g. went to park, Blake talked to two people, bought a soda $2, calm all shift"
              maxLength={4000}
              className="min-h-[72px] w-full resize-y bg-white text-sm"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={runDraftWithNectar}
                disabled={draftBusy || shorthand.trim().length < 3}
                className="min-h-[44px] bg-amber-600 text-white hover:bg-amber-700"
              >
                {draftBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Draft with NECTAR
              </Button>
              {speechSupported && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => (isRecording ? stopRecording() : startRecording())}
                  className="min-h-[44px]"
                >
                  {isRecording ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                  {isRecording ? "Stop voice" : "Speak shorthand"}
                </Button>
              )}
            </div>
            {nectarDraft && (
              <div className="mt-3 rounded-md border-2 border-amber-500 bg-white px-3 py-2.5 shadow-sm">
                <div className="mb-1.5 flex items-center gap-2">
                  <Hexagon className="h-3.5 w-3.5 text-amber-600" fill="currentColor" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    NECTAR draft — review before confirming
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{nectarDraft}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={acceptNectarDraft} className="min-h-[44px]">
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Use draft &amp; edit below
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setNectarDraft(null); setShorthand(""); }}
                    className="min-h-[44px]"
                  >
                    Discard draft
                  </Button>
                </div>
              </div>
            )}
          </div>
        </NectarInfusionLock>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Shift note
          {nectarUsed && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-amber-400 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              <Hexagon className="h-2.5 w-2.5" fill="currentColor" /> AI-drafted — your review required
            </span>
          )}
        </label>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note about what happened during this shift (optional)."
          className="min-h-[72px] text-sm"
        />
        {noteDirty && (
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => saveNote.mutate()} disabled={saveNote.isPending}>
              {saveNote.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
              Save note
            </Button>
          </div>
        )}
      </div>


      {row.staff_flagged && row.staff_flag_reason && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
          <div className="font-medium text-destructive">You flagged this entry:</div>
          <div className="text-muted-foreground">{row.staff_flag_reason}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {row.staff_flagged ? (
          <Button size="sm" variant="ghost" onClick={() => clearFlag.mutate()} disabled={clearFlag.isPending}>
            <X className="mr-1.5 h-3.5 w-3.5" /> Remove flag
          </Button>
        ) : (
          <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Flag className="mr-1.5 h-3.5 w-3.5" /> Flag as wrong
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>What looks wrong?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Describe what's off (wrong day, wrong client, hours don't match, etc.). Flagging keeps the entry pending
                so admin can fix it — it doesn't confirm the hours.
              </p>
              <Textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g. I didn't work this shift, or the clock-out time is off by about an hour."
                className="min-h-[96px]"
              />
              <DialogFooter>
                <Button variant="ghost" onClick={() => setFlagOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => saveFlag.mutate()}
                  disabled={saveFlag.isPending || flagReason.trim().length === 0}
                >
                  {saveFlag.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Submit flag
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Button
          size="sm"
          onClick={() => confirmEntry.mutate()}
          disabled={confirmEntry.isPending || noteDirty}
          title={noteDirty ? "Save your note first, or clear it, before confirming." : undefined}
        >
          {confirmEntry.isPending
            ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
          Confirm hours are accurate
        </Button>
      </div>
    </div>
  );
}
