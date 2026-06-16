import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Check, X, HandMetal } from "lucide-react";
import { listOpenShifts, decideClaim, claimOpenShift } from "@/lib/scheduling/open-shifts.functions";
import { takeOpenShift } from "@/lib/scheduler/setup.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Admin variant: list open + pending-claim shifts. Approve/deny the pending ones.
 * Staff variant: list open shifts only, with Claim button.
 */
export function OpenShiftsPanel({
  organizationId, startIso, endIso, mode, clientNames, onJumpToShift,
}: {
  organizationId: string;
  startIso: string;
  endIso: string;
  mode: "admin" | "staff";
  clientNames?: Map<string, string>;
  onJumpToShift?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOpenShifts);
  const decideFn = useServerFn(decideClaim);
  const claimFn = useServerFn(claimOpenShift);
  const takeFn = useServerFn(takeOpenShift);

  const q = useQuery({
    queryKey: ["open-shifts", organizationId, startIso, endIso],
    queryFn: () => listFn({ data: { organizationId, startIso, endIso } }),
    enabled: !!organizationId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["open-shifts"] });
    qc.invalidateQueries({ queryKey: ["schedule-conflicts"] });
    qc.invalidateQueries({ queryKey: ["shifts-in-range"] });
    qc.invalidateQueries({ queryKey: ["my-scheduled-shifts"] });
    qc.invalidateQueries({ queryKey: ["scheduler-data"] });
  };

  const decide = useMutation({
    mutationFn: (vars: { shiftId: string; approve: boolean }) => decideFn({ data: vars }),
    onSuccess: (_d, v) => { invalidate(); toast.success(v.approve ? "Claim approved" : "Claim denied"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const claim = useMutation({
    mutationFn: (shiftId: string) => claimFn({ data: { shiftId } }),
    onSuccess: () => { invalidate(); toast.success("Claim submitted — awaiting admin approval"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const take = useMutation({
    mutationFn: (shiftId: string) => takeFn({ data: { shift_id: shiftId } }),
    onSuccess: () => { invalidate(); toast.success("Shift added to your schedule."); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't take this shift."),
  });

  const rows = q.data ?? [];
  if (!rows.length) return null;

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold">
          {mode === "staff" ? "Open shifts you're qualified for" : "Open shifts"} ({rows.length})
        </h3>
      </div>
      <ul className="space-y-1.5">
        {rows.map((s) => {
          const pending = s.status === "pending" && !!s.claim_requested_by;
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-2 text-sm md:flex-row md:items-center md:justify-between",
                pending && "border-amber-300 bg-amber-50/60",
              )}
            >
              <button
                type="button"
                onClick={() => onJumpToShift?.(s.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="font-medium">
                  {s.service_code ?? "Shift"} · {fmtWhen(s.starts_at)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {clientNames?.get(s.client_id) ?? "Client"}
                  {pending ? " · awaiting admin approval" : ""}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {mode === "admin" && pending && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 min-h-[44px] md:min-h-0"
                      onClick={() => decide.mutate({ shiftId: s.id, approve: true })}
                      disabled={decide.isPending}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 min-h-[44px] md:min-h-0"
                      onClick={() => decide.mutate({ shiftId: s.id, approve: false })}
                      disabled={decide.isPending}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Deny
                    </Button>
                  </>
                )}
                {mode === "staff" && s.status === "open" && (
                  <>
                    <Button
                      size="sm"
                      className="h-10 min-h-[44px] md:min-h-0"
                      onClick={() => take.mutate(s.id)}
                      disabled={take.isPending || claim.isPending}
                    >
                      <HandMetal className="mr-1 h-3.5 w-3.5" /> Take shift
                    </Button>
                  </>
                )}
                {mode === "staff" && pending && (
                  <span className="text-[11px] font-medium text-amber-700">Pending</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
                {mode === "staff" && pending && (
                  <span className="text-[11px] font-medium text-amber-700">Pending</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
