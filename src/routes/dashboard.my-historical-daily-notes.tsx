// Stage 4 of the historical daily-notes import: the staff member's individual
// attestation page. Each staff member sees ONLY historical notes an admin
// submitted to them — never anyone else's, and never anything not yet
// submitted. All pending notes are shown stacked so the person can scroll
// the whole list; each note is reviewed and signed independently via a
// real checkbox attestation. Signing one note never signs any others.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, CheckCircle2, Info, Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  listMyPendingHistoricalDailyNotes,
  updateMyHistoricalDailyNote,
  attestMyHistoricalDailyNote,
} from "@/lib/historical-daily-note-attestation.functions";
import {
  HISTORICAL_DAILY_NOTE_ATTESTATION_VERSION,
  historicalDailyNoteAttestationText,
} from "@/lib/historical-daily-note-attestation-text";

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

export function MyHistoricalDailyNotesPage() {
  const list = useServerFn(listMyPendingHistoricalDailyNotes);
  const q = useQuery({
    queryKey: ["my-historical-daily-notes-pending"],
    queryFn: () => list(),
  });
  const rows: Row[] = useMemo(() => (q.data?.rows ?? []) as Row[], [q.data]);

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
            notes you wrote to you, they'll appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Historical daily notes to attest</h1>
          <p className="text-sm text-muted-foreground">
            These notes were imported from another platform and submitted to you for review. Scroll through
            all {rows.length} note{rows.length === 1 ? "" : "s"} and sign each one individually — signing one
            does not sign the rest.
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

      <div className="space-y-4">
        {rows.map((row) => (
          <HistoricalDailyNoteCard key={row.id} row={row} />
        ))}
      </div>
    </div>
  );
}

function HistoricalDailyNoteCard({ row }: { row: Row }) {
  const qc = useQueryClient();
  const update = useServerFn(updateMyHistoricalDailyNote);
  const attest = useServerFn(attestMyHistoricalDailyNote);

  const [draft, setDraft] = useState(row.narrative ?? "");
  const [dirty, setDirty] = useState(false);
  const [attested, setAttested] = useState(false);

  const clientName =
    [row.clients?.first_name, row.clients?.last_name].filter(Boolean).join(" ").trim() || "Client";

  const attestationText = historicalDailyNoteAttestationText({
    clientName,
    serviceDate: row.log_date,
  });

  const saveDraft = useMutation({
    mutationFn: async () => {
      await update({ data: { id: row.id, narrative: draft } });
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
      await attest({
        data: {
          id: row.id,
          narrative: draft,
          attested: true,
          attestation_text: attestationText,
          attestation_version: HISTORICAL_DAILY_NOTE_ATTESTATION_VERSION,
        },
      });
    },
    onSuccess: () => {
      toast.success("Signed. This note is now finalized as historical evidence.");
      qc.invalidateQueries({ queryKey: ["my-historical-daily-notes-pending"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <article className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{clientName}</div>
          <div className="text-xs text-muted-foreground">
            {row.log_date}
            {row.import_job_id && <> · Import batch {row.import_job_id.slice(0, 8)}</>}
          </div>
        </div>
      </div>

      <label className="mt-4 block text-xs font-medium text-muted-foreground" htmlFor={`narrative-${row.id}`}>
        Narrative
      </label>
      <Textarea
        id={`narrative-${row.id}`}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setDirty(true); }}
        className="mt-1 min-h-[220px] text-sm"
        placeholder="What happened that day for this client?"
      />

      {row.pcsp_goals_addressed && row.pcsp_goals_addressed.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-muted-foreground">Goals addressed (from the import)</div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {row.pcsp_goals_addressed.map((g, i) => <li key={i}>{g}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            id={`attest-${row.id}`}
            checked={attested}
            onCheckedChange={(v) => setAttested(v === true)}
            className="mt-1"
          />
          <label htmlFor={`attest-${row.id}`} className="cursor-pointer select-none text-xs leading-relaxed text-foreground">
            {attestationText.split("\n\n").map((para, i) => (
              <p key={i} className={i === 0 ? "font-medium" : "mt-2 text-muted-foreground"}>
                {para}
              </p>
            ))}
          </label>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
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
          disabled={sign.isPending || !draft.trim() || !attested}
          onClick={() => sign.mutate()}
        >
          {sign.isPending
            ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          Sign this note
        </Button>
      </div>
      {!attested && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Check the attestation box above to enable signing.
        </p>
      )}
    </article>
  );
}
