import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Hexagon,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Moon,
  CheckCircle2,
  Info,
} from "lucide-react";
import {
  listAuthorizedCodes,
  upsertAuthorizedCode,
  removeAuthorizedCode,
} from "@/lib/nectar-engine.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Prompt 34 — Authorized codes panel.
 *
 * Source of truth for which service codes the provider is CONTRACTED to
 * deliver. NECTAR's coverage follows this set (active OR dormant), so a
 * dormant code doesn't lose audit protection when it's later activated.
 *
 * Addendum uploads expand this set: an addendum marked as authoritative can
 * authorize additional codes that NECTAR drafts requirements for under the
 * same propose/confirm flow as the original contract/SOW.
 */
export function AuthorizedCodesPanel({ orgId }: { orgId: string }) {
  const list = useServerFn(listAuthorizedCodes);
  const upsert = useServerFn(upsertAuthorizedCode);
  const remove = useServerFn(removeAuthorizedCode);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["authorized-codes", orgId],
    queryFn: () => list({ data: { organizationId: orgId } }),
  });

  const upsertM = useMutation({
    mutationFn: (vars: {
      code: string;
      status: "active" | "dormant";
      source: "manual" | "contract" | "sow" | "addendum";
      label?: string;
    }) =>
      upsert({
        data: {
          organizationId: orgId,
          code: vars.code,
          status: vars.status,
          source: vars.source,
          label: vars.label ?? null,
        },
      }),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["authorized-codes", orgId] });
      if ((res as { existed?: boolean }).existed) {
        toast.info(`${vars.code.toUpperCase()} is already authorized — no changes made.`);
      } else {
        toast.success("Authorized code saved — NECTAR will keep its requirements live.");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authorized-codes", orgId] });
      toast.success("Removed from authorized set.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [newCode, setNewCode] = useState("");
  const [newSource, setNewSource] = useState<
    "manual" | "contract" | "sow" | "addendum"
  >("contract");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <Hexagon className="h-5 w-5 text-amber-600 dark:text-amber-300 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-foreground">
              Coverage follows the contract — not current activity
            </div>
            <p className="mt-1 text-muted-foreground">
              Every code your contract/SOW authorizes stays covered by NECTAR's
              rules and requirements, even if no client is currently using it.
              When a dormant code activates (e.g. a client gets SLH), the
              requirements are already in place — no scramble.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-background/60 p-4 backdrop-blur">
        <div className="text-sm font-medium mb-2 flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add an authorized code
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grow min-w-[140px]">
            <label className="text-xs text-muted-foreground">Service code</label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value.toUpperCase())}
              placeholder="e.g. SLH, HHS, PPS"
              maxLength={40}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs text-muted-foreground">Source</label>
            <Select
              value={newSource}
              onValueChange={(v) =>
                setNewSource(v as typeof newSource)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="sow">State SOW</SelectItem>
                <SelectItem value="addendum">Addendum</SelectItem>
                <SelectItem value="manual">Manual entry</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              if (!newCode.trim()) {
                toast.error("Enter a code first.");
                return;
              }
              upsertM.mutate(
                {
                  code: newCode.trim(),
                  status: "dormant",
                  source: newSource,
                },
                { onSuccess: () => setNewCode("") },
              );
            }}
            disabled={upsertM.isPending}
          >
            {upsertM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add code
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" />
          Uploading a contract addendum in the Sources tab also adds its
          authorized codes here automatically — NECTAR drafts the requirements
          for the new codes and you confirm them like any other source.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-border/60 bg-background/60 p-6 text-center text-sm text-muted-foreground backdrop-blur">
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading
          authorized codes…
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-background/60 backdrop-blur overflow-hidden">
          <div className="px-4 py-3 border-b border-border/60 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              {data?.summary.total ?? 0} total covered
            </Badge>
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              {data?.summary.active ?? 0} active
            </Badge>
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <Moon className="h-3 w-3" />
              {data?.summary.dormant ?? 0} dormant / standby
            </Badge>
            {(data?.summary.inferredOnly ?? 0) > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400/40">
                {data!.summary.inferredOnly} inferred from data — promote to lock
              </Badge>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {(data?.codes ?? []).map((row) => (
              <CodeRow
                key={row.id ?? `inferred-${row.code}`}
                row={row}
                onPromote={() =>
                  upsertM.mutate({
                    code: row.code,
                    status: row.inUse ? "active" : "dormant",
                    source: "manual",
                  })
                }
                onRemove={() => row.id && removeM.mutate(row.id)}
                removing={removeM.isPending}
              />
            ))}
            {(data?.codes ?? []).length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No authorized codes yet. Add the codes your contract authorizes
                — NECTAR will keep requirements live for them even before
                they're used.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeRow({
  row,
  onPromote,
  onRemove,
  removing,
}: {
  row: {
    id: string | null;
    code: string;
    label: string | null;
    status: string;
    source: string;
    notes: string | null;
    inUse: boolean;
    confirmedRequirements: number;
    proposedRequirements: number;
  };
  onPromote: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const isInferred = !row.id;
  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="font-mono text-base font-semibold tracking-tight min-w-[60px]">
        {row.code}
      </div>
      <div className="flex flex-wrap gap-1.5 grow">
        {row.inUse ? (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Active
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 text-muted-foreground border-border/80"
          >
            <Moon className="h-3 w-3" /> Standby (authorized, not in use)
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          {row.source}
        </Badge>
        {row.confirmedRequirements > 0 && (
          <Badge variant="secondary" className="text-[11px]">
            {row.confirmedRequirements} confirmed req
            {row.confirmedRequirements === 1 ? "" : "s"}
          </Badge>
        )}
        {row.proposedRequirements > 0 && (
          <Badge
            variant="outline"
            className="text-[11px] border-amber-400/40 text-amber-700 dark:text-amber-300"
          >
            {row.proposedRequirements} NECTAR proposal
            {row.proposedRequirements === 1 ? "" : "s"}
          </Badge>
        )}
        {row.label && (
          <span className="text-xs text-muted-foreground">{row.label}</span>
        )}
        {row.notes && (
          <span className="text-[11px] text-muted-foreground italic">
            {row.notes}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isInferred ? (
          <Button size="sm" variant="outline" onClick={onPromote}>
            Lock as authorized
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            disabled={removing}
            title={`Remove ${row.code} from authorized set`}
            aria-label={`Remove ${row.code} from authorized codes`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>

        )}
      </div>
    </div>
  );
}
