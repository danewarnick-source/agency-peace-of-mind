import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { autoAssignRange } from "@/lib/scheduling/auto-assign.functions";

type Proposal = {
  shiftId: string;
  clientName: string;
  startsAt: string;
  endsAt: string;
  serviceCode: string | null;
  staffId: string | null;
  staffName: string | null;
  score: number;
  reasons: string[];
  blocked: boolean;
  reason: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  weekStart: Date;
  onApplied?: () => void;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function AutoAssignDrawer({ open, onOpenChange, organizationId, weekStart, onApplied }: Props) {
  const callFn = useServerFn(autoAssignRange);
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const preview = async () => {
    setLoading(true);
    try {
      const res = await callFn({
        data: {
          organizationId,
          startIso: weekStart.toISOString(),
          endIso: weekEnd.toISOString(),
          dryRun: true,
        },
      }) as { proposals: Proposal[]; applied: number };
      setProposals(res.proposals);
      setSelected(new Set(res.proposals.filter(p => !p.blocked).map(p => p.shiftId)));
    } catch (e: any) { toast.error(e?.message ?? "Preview failed"); }
    finally { setLoading(false); }
  };

  const apply = async () => {
    if (!proposals?.length || selected.size === 0) return;
    setLoading(true);
    try {
      const res = await callFn({
        data: {
          organizationId,
          startIso: weekStart.toISOString(),
          endIso: weekEnd.toISOString(),
          dryRun: false,
          applyShiftIds: Array.from(selected),
        },
      }) as { proposals: Proposal[]; applied: number };
      toast.success(`Assigned ${res.applied} shift${res.applied === 1 ? "" : "s"}`);
      setProposals(null); setSelected(new Set());
      onApplied?.();
      onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Apply failed"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setProposals(null); setSelected(new Set()); } onOpenChange(v); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto-assign open shifts</DialogTitle>
          <DialogDescription>
            Ranks eligible staff for every open shift this week and proposes assignments.
            Hard rules (overlaps, PTO) are always respected.
          </DialogDescription>
        </DialogHeader>

        {!proposals ? (
          <div className="py-6 text-center">
            <Button onClick={preview} disabled={loading}>
              {loading ? "Analyzing…" : "Preview suggestions"}
            </Button>
          </div>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No open shifts this week.</p>
        ) : (
          <div className="space-y-2">
            {proposals.map((p) => (
              <label
                key={p.shiftId}
                className={`flex items-start gap-3 p-3 border rounded-md cursor-pointer ${
                  p.blocked ? "opacity-60 bg-muted/30" : "hover:bg-muted/20"
                }`}
              >
                <Checkbox
                  checked={selected.has(p.shiftId)}
                  disabled={p.blocked}
                  onCheckedChange={(v) => {
                    const next = new Set(selected);
                    if (v) next.add(p.shiftId); else next.delete(p.shiftId);
                    setSelected(next);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{p.clientName}</span>
                    {p.serviceCode && <Badge variant="outline">{p.serviceCode}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {fmt(p.startsAt)} – {fmt(p.endsAt)}
                    </span>
                  </div>
                  <div className="text-sm mt-1">
                    {p.blocked ? (
                      <span className="text-destructive">No eligible staff</span>
                    ) : (
                      <>
                        <span className="font-medium">→ {p.staffName}</span>
                        <span className="text-muted-foreground"> · {p.reason} · score {Math.round(p.score)}</span>
                      </>
                    )}
                  </div>
                  {p.reasons.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.reasons.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {proposals && proposals.length > 0 && (
            <Button onClick={apply} disabled={loading || selected.size === 0}>
              Apply {selected.size} assignment{selected.size === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
