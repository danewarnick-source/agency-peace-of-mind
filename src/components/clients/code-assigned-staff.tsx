// Per-code staff assignment control. Shows who is currently assigned to
// work a given authorized service code for a client, plus a "+ Add staff"
// popover to assign/swap staff right there — no navigation. Reads/writes
// the same staff_assignments rows as CaseloadEditor via
// addStaffToClientCode / removeStaffFromClientCode, so a change here shows
// up immediately on the client's Caseload editor and the staff member's own
// assignment list.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X, UserPlus } from "lucide-react";
import { addStaffToClientCode, removeStaffFromClientCode } from "@/lib/scheduler/setup.functions";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  clientCodeAssignmentsQueryKey,
  useClientCodeAssignments,
} from "@/hooks/use-client-code-assignments";

function invalidateAssignmentQueries(qc: ReturnType<typeof useQueryClient>, clientId: string) {
  qc.invalidateQueries({ queryKey: clientCodeAssignmentsQueryKey(clientId) });
  qc.invalidateQueries({ queryKey: ["caseload-editor-current-v2"] });
  qc.invalidateQueries({ queryKey: ["caseload"] });
  qc.invalidateQueries({ queryKey: ["my-assignments"] });
  qc.invalidateQueries({ queryKey: ["client-care-data"] });
  qc.invalidateQueries({ queryKey: ["scheduler-data"] });
}

export function CodeAssignedStaff({
  clientId,
  code,
}: {
  clientId: string;
  code: string;
}) {
  const qc = useQueryClient();
  const { data: org } = useCurrentOrg();
  const { staffForCode, unassignedForCode, isLoading } = useClientCodeAssignments(clientId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const addFn = useServerFn(addStaffToClientCode);
  const removeFn = useServerFn(removeStaffFromClientCode);

  const addM = useMutation({
    mutationFn: (staff_id: string) =>
      addFn({
        data: {
          organization_id: org!.organization_id,
          client_id: clientId,
          staff_id,
          service_code: code,
        },
      }),
    onSuccess: () => {
      invalidateAssignmentQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: (staff_id: string) =>
      removeFn({
        data: {
          organization_id: org!.organization_id,
          client_id: clientId,
          staff_id,
          service_code: code,
        },
      }),
    onSuccess: () => {
      invalidateAssignmentQueries(qc, clientId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assigned = staffForCode(code);
  const candidates = unassignedForCode(code).filter((s) =>
    s.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isLoading ? (
        <span className="text-xs text-muted-foreground">Loading…</span>
      ) : assigned.length === 0 ? (
        <span className="text-xs text-muted-foreground">No staff assigned</span>
      ) : (
        assigned.map((s) => (
          <Badge key={s.id} variant="secondary" className="gap-1 pr-1 text-[11px]">
            {s.name}
            <button
              type="button"
              aria-label={`Unassign ${s.name} from ${code}`}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              disabled={removeM.isPending}
              onClick={() => removeM.mutate(s.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" disabled={!org?.organization_id}>
            <Plus className="h-3 w-3" /> Add staff
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-medium">
            <UserPlus className="h-3.5 w-3.5" /> Assign staff to {code}
          </div>
          <Input
            placeholder="Filter staff…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-8 text-xs"
          />
          <div className="max-h-56 space-y-0.5 overflow-y-auto">
            {candidates.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                {unassignedForCode(code).length === 0
                  ? "All active staff are already assigned to this code."
                  : "No matches."}
              </div>
            ) : (
              candidates.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={addM.isPending}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => {
                    addM.mutate(s.id);
                    setSearch("");
                  }}
                >
                  <span className="truncate">{s.name}</span>
                  <Plus className="h-3 w-3 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
