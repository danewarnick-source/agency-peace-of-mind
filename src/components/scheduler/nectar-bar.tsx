// Nectar bar — admin types a sentence, Nectar drafts shifts, admin reviews
// and applies. Also exposes Auto-fill for open shifts in the visible week.
// All work flows through real records — no placeholder data.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Wand2, AlertTriangle, Loader2, Check, Repeat } from "lucide-react";
import {
  nectarDraftShifts,
  autoFillOpenShifts,
  applyDrafts,
} from "@/lib/scheduler/setup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { RepeatShiftsDialog } from "./repeat-shifts-dialog";

type Draft = {
  staff_id: string | null;
  staff_label: string | null;
  client_id: string | null;
  client_label: string | null;
  service_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  flags: string[];
};

type Proposal = {
  shift_id: string;
  client_id: string;
  service_code: string;
  starts_at: string;
  ends_at: string;
  staff_id: string | null;
  reason: string;
};

function fmtWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function NectarBar({
  organizationId,
  weekStartIso,
  clientNameById,
}: {
  organizationId: string;
  weekStartIso: string;
  clientNameById: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const draftFn = useServerFn(nectarDraftShifts);
  const autoFn = useServerFn(autoFillOpenShifts);
  const applyFn = useServerFn(applyDrafts);

  const draftMut = useMutation({
    mutationFn: () =>
      draftFn({
        data: {
          organization_id: organizationId,
          prompt,
          week_start_iso: weekStartIso,
        },
      }),
    onSuccess: (r) => {
      setProposals(null);
      setDrafts(r.drafts);
      setPicked(new Set(r.drafts.map((_, i) => i)));
      if (r.drafts.length === 0)
        toast.info("Nectar didn't return any drafts — try a more specific prompt.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoMut = useMutation({
    mutationFn: () =>
      autoFn({
        data: { organization_id: organizationId, week_start_iso: weekStartIso },
      }),
    onSuccess: (r) => {
      setDrafts(null);
      setProposals(r.proposals);
      setPicked(
        new Set(
          r.proposals
            .map((p, i) => (p.staff_id ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
      if (r.proposals.length === 0) toast.info("No open shifts this week.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyMut = useMutation({
    mutationFn: () => {
      if (drafts) {
        const rows = drafts
          .map((d, i) => ({ d, i }))
          .filter(({ i }) => picked.has(i))
          .map(({ d }) => ({
            staff_id: d.staff_id,
            client_id: d.client_id,
            service_code: d.service_code,
            starts_at: d.starts_at,
            ends_at: d.ends_at,
            notes: d.notes,
          }));
        return applyFn({ data: { organization_id: organizationId, drafts: rows } });
      }
      if (proposals) {
        const rows = proposals
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => picked.has(i) && proposals[i].staff_id)
          .map(({ p }) => ({
            assign_to_shift_id: p.shift_id,
            staff_id: p.staff_id,
          }));
        return applyFn({ data: { organization_id: organizationId, drafts: rows } });
      }
      return Promise.resolve({ created: 0, assigned: 0 });
    },
    onSuccess: (r) => {
      toast.success(
        `${r.created} shifts created, ${r.assigned} open shifts assigned.`,
      );
      qc.invalidateQueries({ queryKey: ["scheduler-data"] });
      qc.invalidateQueries({ queryKey: ["open-shifts"] });
      setDrafts(null);
      setProposals(null);
      setPicked(new Set());
      setPrompt("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const open = !!(drafts || proposals);
  const rowCount = drafts?.length ?? proposals?.length ?? 0;
  const togglePick = (i: number) => {
    const next = new Set(picked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setPicked(next);
  };

  return (
    <div
      className="rounded-xl border bg-card p-2.5 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center"
      style={{ borderColor: "#e6e7ee" }}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
        <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        Ask Nectar
      </div>
      <Input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Maria on PAC for Sam Tu/Th 9a–1p this week"
        className="flex-1 min-h-[40px]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && prompt.trim()) draftMut.mutate();
        }}
      />
      <div className="flex gap-2">
        <Button
          onClick={() => draftMut.mutate()}
          disabled={!prompt.trim() || draftMut.isPending}
          className="min-h-[40px]"
        >
          {draftMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span className="ml-1.5">Draft</span>
        </Button>
        <Button
          variant="outline"
          onClick={() => autoMut.mutate()}
          disabled={autoMut.isPending}
          className="min-h-[40px]"
        >
          {autoMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          <span className="ml-1.5">Auto-fill open shifts</span>
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setDrafts(null);
            setProposals(null);
            setPicked(new Set());
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {drafts ? "Review Nectar drafts" : "Review auto-fill proposals"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {picked.size} of {rowCount} selected
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto -mx-1">
            {rowCount === 0 ? (
              <div className="text-sm text-muted-foreground p-6 text-center">
                Nothing to review.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2 text-left w-8"></th>
                    <th className="px-2 py-2 text-left">Staff</th>
                    <th className="px-2 py-2 text-left">Client</th>
                    <th className="px-2 py-2 text-left">Code</th>
                    <th className="px-2 py-2 text-left">When</th>
                    <th className="px-2 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {drafts?.map((d, i) => {
                    const hard =
                      !d.client_id ||
                      !d.service_code ||
                      !d.starts_at ||
                      !d.ends_at;
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={picked.has(i)}
                            onChange={() => togglePick(i)}
                            disabled={hard}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="px-2 py-2">
                          {d.staff_label ?? (
                            <span className="text-muted-foreground italic">
                              open
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">{d.client_label ?? "—"}</td>
                        <td className="px-2 py-2 font-mono">
                          {d.service_code ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-xs tabular-nums">
                          {fmtWhen(d.starts_at)}
                          {d.ends_at ? ` – ${fmtWhen(d.ends_at).split(", ").pop()}` : ""}
                        </td>
                        <td className="px-2 py-2">
                          {d.flags.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs">
                              <Check className="h-3 w-3" /> ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 text-xs">
                              <AlertTriangle className="h-3 w-3" />
                              {d.flags.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {proposals?.map((p, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={picked.has(i)}
                          onChange={() => togglePick(i)}
                          disabled={!p.staff_id}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {p.staff_id ? (
                          <span className="text-foreground">
                            {/* staff label not in proposal; rendered as id-shortened */}
                            staff selected
                          </span>
                        ) : (
                          <span className="text-amber-700 italic">
                            no eligible staff
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {clientNameById.get(p.client_id) ?? "Client"}
                      </td>
                      <td className="px-2 py-2 font-mono">{p.service_code}</td>
                      <td className="px-2 py-2 text-xs tabular-nums">
                        {fmtWhen(p.starts_at)}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {p.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDrafts(null);
                setProposals(null);
                setPicked(new Set());
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => applyMut.mutate()}
              disabled={applyMut.isPending || picked.size === 0}
            >
              {applyMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : null}
              Apply {picked.size} selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
