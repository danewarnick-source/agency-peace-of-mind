// Admin-only stage-4 fallback for the historical daily-notes import: when the
// staff member who wrote a note no longer works at the organization and has
// no platform access, an admin or manager can attest on their behalf. Rows
// signed here are PERMANENTLY labeled as attested on behalf of a former
// staff member — they are never presented as if the original staff signed
// themselves.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, CheckCircle2, Info, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  listFormerStaffHistoricalDailyNotes,
  adminAttestHistoricalDailyNoteOnBehalf,
} from "@/lib/historical-daily-note-attestation.functions";

export const Route = createFileRoute("/dashboard/historical-daily-notes-former-staff")({
  head: () => ({ meta: [{ title: "Attest on behalf of former staff — HIVE" }] }),
  component: FormerStaffAttestPage,
});

type Row = {
  id: string;
  user_id: string;
  client_id: string;
  log_date: string;
  narrative: string;
  pcsp_goals_addressed: string[] | null;
  import_job_id: string | null;
  clients: { id: string; first_name: string | null; last_name: string | null } | null;
};

function FormerStaffAttestPage() {
  const { data: org } = useCurrentOrg();
  const list = useServerFn(listFormerStaffHistoricalDailyNotes);
  const attest = useServerFn(adminAttestHistoricalDailyNoteOnBehalf);
  const qc = useQueryClient();

  const q = useQuery({
    enabled: !!org?.organization_id,
    queryKey: ["historical-daily-notes-former-staff", org?.organization_id],
    queryFn: () => list({ data: { organization_id: org!.organization_id } }),
  });

  const rows: Row[] = useMemo(() => (q.data?.rows ?? []) as Row[], [q.data]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});

  const attestMut = useMutation({
    mutationFn: async (row: Row) => {
      const reason = (reasonById[row.id] ?? "").trim();
      if (reason.length < 3) throw new Error("Enter a short reason (why this staff member can't sign).");
      await attest({
        data: { id: row.id, organization_id: org!.organization_id, reason },
      });
    },
    onSuccess: () => {
      toast.success("Attested on behalf of former staff. Note is permanently labeled as such.");
      qc.invalidateQueries({ queryKey: ["historical-daily-notes-former-staff", org?.organization_id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!org?.organization_id) {
    return <div className="p-6 text-sm text-muted-foreground">Loading organization…</div>;
  }
  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (q.isError) return <div className="p-6 text-sm text-destructive">Failed to load pending notes.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5" /> Attest on behalf of former staff
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only historical daily notes written by staff members who no longer have active platform access
          appear here. Notes you attest are permanently labeled as attested by an admin on behalf of a former
          staff member — they are never presented as if that person signed themselves. Current staff must
          sign their own notes from their own screen; those never appear on this page.
        </p>
      </header>

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <Info className="mr-1 inline h-3 w-3" />
        Nothing here creates or edits note content on behalf of a staff member. You are signing off on the
        record as it was imported. If the narrative is empty or wrong and no one remembers what happened,
        do not attest — leave it pending.
      </div>

      {rows.length === 0 && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-6 text-center text-sm">
          <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
          <div className="mt-2 font-medium">No former-staff notes waiting for admin attestation.</div>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((r) => {
          const clientName =
            [r.clients?.first_name, r.clients?.last_name].filter(Boolean).join(" ").trim() || "Client";
          return (
            <article key={r.id} className="rounded-2xl border border-border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="font-medium">{clientName} · {r.log_date}</div>
                  <div className="text-xs text-muted-foreground">
                    Former staff id {r.user_id.slice(0, 8)}… (no active platform access)
                  </div>
                </div>
                <Badge variant="outline" className="border-amber-500/40 text-amber-700">
                  <Archive className="mr-1 h-3 w-3" />
                  Historical import
                </Badge>
              </div>

              <div className="mt-3 rounded border border-border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
                {r.narrative || <span className="italic text-muted-foreground">(blank narrative)</span>}
              </div>

              {r.pcsp_goals_addressed && r.pcsp_goals_addressed.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                  {r.pcsp_goals_addressed.map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              )}

              <label className="mt-3 block text-xs font-medium">Reason for admin proxy attestation</label>
              <Textarea
                value={reasonById[r.id] ?? ""}
                onChange={(e) => setReasonById((m) => ({ ...m, [r.id]: e.target.value }))}
                placeholder="e.g. Staff left the agency in 2024 and has no platform access."
                className="mt-1 min-h-[60px] text-xs"
              />

              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  onClick={() => attestMut.mutate(r)}
                  disabled={attestMut.isPending}
                >
                  {attestMut.isPending
                    ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    : <ShieldCheck className="mr-1.5 h-4 w-4" />}
                  Attest on behalf of former staff
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
