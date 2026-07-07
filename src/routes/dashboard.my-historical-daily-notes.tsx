// Stage 4 of the historical daily-notes import: the staff member's individual
// attestation page. Each staff member sees ONLY historical notes an admin
// submitted to them — never anyone else's, and never anything not yet
// submitted. Notes are reviewed and signed ONE AT A TIME; signing one note
// never signs any others. Staff may correct or expand the narrative before
// signing (the row is theirs and no one else can). Signed notes remain
// permanently marked as historical imports.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  listMyPendingHistoricalDailyNotes,
  updateMyHistoricalDailyNote,
  attestMyHistoricalDailyNote,
} from "@/lib/historical-daily-note-attestation.functions";

export const Route = createFileRoute("/dashboard/my-historical-daily-notes")({
  head: () => ({ meta: [{ title: "Historical daily notes to attest — HIVE" }] }),
  component: MyHistoricalDailyNotesPage,
});

type Row = {
  id: string;
  client_id: string;
  log_date: string;
  narrative: string;
  pcsp_goals_addressed: string[] | null;
  import_job_id: string | null;
  clients: { id: string; first_name: string | null; last_name: string | null } | null;
};

function MyHistoricalDailyNotesPage() {
  const list = useServerFn(listMyPendingHistoricalDailyNotes);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-historical-daily-notes-pending"],
    queryFn: () => list(),
  });
  const rows: Row[] = useMemo(() => (q.data?.rows ?? []) as Row[], [q.data]);
  const [cursor, setCursor] = useState(0);
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  // Reset the draft any time the cursor lands on a new note.
  const current = rows[cursor] ?? null;
  const currentId = current?.id ?? null;
  const [lastId, setLastId] = useState<string | null>(null);
  if (currentId !== lastId) {
    setLastId(currentId);
    setDraft(current?.narrative ?? "");
    setDirty(false);
  }

  const update = useServerFn(updateMyHistoricalDailyNote);
  const attest = useServerFn(attestMyHistoricalDailyNote);

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await update({ data: { id: current.id, narrative: draft } });
    },
    onSuccess: () => {
      toast.success("Saved. It's still unsigned until you attest.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["my-historical-daily-notes-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sign = useMutation({
    mutationFn: async () => {
      if (!current) return;
      await attest({ data: { id: current.id, narrative: draft } });
    },
    onSuccess: () => {
      toast.success("Signed. This note is now finalized as historical evidence.");
      // Refresh the list; keep cursor position so the next unattested note
      // slides into place. If we ran out, cursor clamps naturally below.
      qc.invalidateQueries({ queryKey: ["my-historical-daily-notes-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your historical daily notes…</div>;
  }
  if (q.isError) {
    return <div className="p-6 text-sm text-destructive">Couldn't load your historical daily notes.</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <div className="mt-2 font-semibold">You're all caught up</div>
          <p className="mt-1 text-sm text-muted-foreground">
            You have no historical daily notes waiting for your attestation. When an admin submits historical
            notes you wrote to you, they'll appear here — one at a time.
          </p>
        </div>
      </div>
    );
  }

  // Clamp the cursor if the list shrank after a sign.
  const safeCursor = Math.min(cursor, rows.length - 1);
  if (safeCursor !== cursor) setCursor(safeCursor);

  const currentSafe = rows[safeCursor];
  const clientName =
    [currentSafe?.clients?.first_name, currentSafe?.clients?.last_name].filter(Boolean).join(" ").trim() ||
    "Client";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Historical daily notes to attest</h1>
          <p className="text-sm text-muted-foreground">
            These notes were imported from another platform and submitted to you for review. Sign each one
            individually — signing one does not sign the rest.
          </p>
        </div>
        <Badge variant="outline" className="border-amber-500/40 text-amber-700">
          <Archive className="mr-1 h-3 w-3" />
          Historical import
        </Badge>
      </header>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mr-1 inline h-3 w-3" />
        If a note reads as thin or incomplete, you can add to or correct it before you sign — you're the person
        who was there. Nothing is auto-filled. If you don't remember what happened that day, leave it and ask
        your supervisor.
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Note {safeCursor + 1} of {rows.length} waiting for your attestation</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={safeCursor === 0}
            onClick={() => setCursor((c) => Math.max(0, c - 1))}
          >
            <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={safeCursor >= rows.length - 1}
            onClick={() => setCursor((c) => Math.min(rows.length - 1, c + 1))}
          >
            Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{clientName}</div>
            <div className="text-xs text-muted-foreground">
              {currentSafe.log_date}
              {currentSafe.import_job_id && (
                <> · Import batch {currentSafe.import_job_id.slice(0, 8)}</>
              )}
            </div>
          </div>
        </div>

        <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor="narrative">
          Narrative
        </label>
        <Textarea
          id="narrative"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
          className="mt-1 min-h-[220px] text-sm"
          placeholder="What happened that day for this client?"
        />

        {currentSafe.pcsp_goals_addressed && currentSafe.pcsp_goals_addressed.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-muted-foreground">Goals addressed (from the import)</div>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {currentSafe.pcsp_goals_addressed.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || saveDraft.isPending}
            onClick={() => saveDraft.mutate()}
          >
            {saveDraft.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <PenLine className="mr-1.5 h-4 w-4" />}
            Save changes (still unsigned)
          </Button>
          <Button
            size="sm"
            disabled={sign.isPending || !draft.trim()}
            onClick={() => sign.mutate()}
          >
            {sign.isPending
              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            Sign this note
          </Button>
        </div>
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Signing finalizes this one note only. The remaining {Math.max(0, rows.length - 1)} note{rows.length - 1 === 1 ? "" : "s"}
          {" "}stay unsigned until you review them.
        </p>
      </article>
    </div>
  );
}
