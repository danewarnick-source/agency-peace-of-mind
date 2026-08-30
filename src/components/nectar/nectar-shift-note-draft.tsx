import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { draftShiftNote } from "@/lib/ai-coach.functions";
import { NECTAR_DRAFT_MIN_WORDS, nectarDraftReady } from "@/lib/nectar-note-gate";
import { toast } from "sonner";

/**
 * Clock-out / HHS daily-note NECTAR draft. Staff must already have written
 * at least 30 words. Follow-up answers fold into the draft. Applying the
 * draft is what counts as "used NECTAR" for the assist attest.
 */
export function NectarShiftNoteDraft({
  narrative,
  goals,
  clientFirstName,
  onApplyDraft,
  onUsed,
}: {
  narrative: string;
  goals: string[];
  clientFirstName: string;
  onApplyDraft: (draft: string) => void;
  onUsed: () => void;
}) {
  const draftFn = useServerFn(draftShiftNote);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);

  const ready = nectarDraftReady(narrative);

  async function runDraft(followUpAnswers?: string) {
    if (!ready && !followUpAnswers) {
      toast.error(
        `Write at least ${NECTAR_DRAFT_MIN_WORDS} words about how you supported the person before NECTAR can draft.`,
      );
      return;
    }
    setBusy(true);
    try {
      const res = await draftFn({
        data: {
          shorthand: narrative.trim(),
          goals,
          clientFirstName,
          followUpAnswers,
        },
      });
      setDraft(res.draft);
      const qs = (res.followUps ?? []).map((f) => f.question).filter(Boolean);
      setFollowUps(qs);
      setAnswers(qs.map(() => ""));
    } catch (e) {
      toast.error((e as Error).message || "NECTAR could not draft — type the note yourself.");
    } finally {
      setBusy(false);
    }
  }

  function foldFollowUps() {
    const filled = followUps
      .map((q, i) => {
        const a = (answers[i] ?? "").trim();
        return a ? `Q: ${q}\nA: ${a}` : "";
      })
      .filter(Boolean);
    if (filled.length === 0) {
      toast.error("Answer the follow-up questions so NECTAR can finish the draft.");
      return;
    }
    void runDraft(filled.join("\n\n"));
  }

  function applyDraft() {
    const text = draft.trim();
    if (!text) return;
    onApplyDraft(text);
    onUsed();
    setDraft("");
    setFollowUps([]);
    setAnswers([]);
    toast.success("Draft added to your note. Edit anything that is not right.");
  }

  return (
    <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
          NECTAR draft
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void runDraft()}
          disabled={busy || !ready}
          className="border-amber-600/60 text-amber-800 hover:bg-amber-50"
        >
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
          Draft with NECTAR
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Optional. NECTAR waits until your note has {NECTAR_DRAFT_MIN_WORDS} words
        describing how you supported the person. Typing is enough; dictating is optional.
      </p>

      {followUps.length > 0 && (
        <div className="space-y-2 rounded-md border border-border bg-background p-2.5">
          <p className="text-[11px] font-semibold">NECTAR needs a bit more:</p>
          {followUps.map((q, i) => (
            <div key={q} className="grid gap-1">
              <Label className="text-[11px]">{q}</Label>
              <Input
                value={answers[i] ?? ""}
                onChange={(e) => {
                  const next = [...answers];
                  next[i] = e.target.value;
                  setAnswers(next);
                }}
                className="h-9 text-sm"
                maxLength={400}
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            onClick={foldFollowUps}
            disabled={busy}
          >
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            Add answers to draft
          </Button>
        </div>
      )}

      {draft && (
        <div className="space-y-2">
          <Label className="text-[11px]">NECTAR draft — edit before using</Label>
          <Textarea
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={applyDraft}>
              Use draft in note
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setDraft("");
                setFollowUps([]);
                setAnswers([]);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
