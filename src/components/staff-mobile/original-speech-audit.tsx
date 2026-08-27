/** Read-only audit panel for the staff member's original spoken words. */
export function OriginalSpeechAudit({ transcript }: { transcript: string }) {
  const text = transcript.trim();
  if (!text) return null;

  return (
    <div className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        What you said
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{text}</p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Original speech is kept as an audit record. It is not the note you submit — review and edit
        the note below, then attest.
      </p>
    </div>
  );
}
