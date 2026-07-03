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
  Archive,
  ArchiveRestore,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import {
  listAuthorizedCodes,
  upsertAuthorizedCode,
  removeAuthorizedCode,
  archiveAuthorizedCode,
  unarchiveAuthorizedCode,
  confirmAuthorizedCode,
} from "@/lib/nectar-engine.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Prompt 35 — Authorized codes panel.
 *
 * A code stays in provider_authorized_codes forever once added (coverage
 * follows the contract, not current activity). This panel FLAGS which
 * authorized codes currently have no active client, so the display is honest
 * — but never auto-removes anything. Admins may soft-archive (archived_at)
 * unverified codes they don't recognize; archiving hides the row from the
 * default list but the row is preserved for 7-year retention.
 */
type CodeRowT = {
  id: string | null;
  code: string;
  label: string | null;
  status: string;
  source: string;
  notes: string | null;
  inUse: boolean;
  hasActiveClient: boolean;
  displayStatus: "active" | "standby" | "standby-unverified" | "archived";
  confirmedRequirements: number;
  proposedRequirements: number;
  archived_at: string | null;
  confirmed_at: string | null;
};

export function AuthorizedCodesPanel({ orgId }: { orgId: string }) {
  const list = useServerFn(listAuthorizedCodes);
  const upsert = useServerFn(upsertAuthorizedCode);
  const remove = useServerFn(removeAuthorizedCode);
  const archive = useServerFn(archiveAuthorizedCode);
  const unarchive = useServerFn(unarchiveAuthorizedCode);
  const confirmFn = useServerFn(confirmAuthorizedCode);
  const qc = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["authorized-codes", orgId, showArchived],
    queryFn: () =>
      list({ data: { organizationId: orgId, includeArchived: showArchived } }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["authorized-codes", orgId] });

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
    onSuccess: () => {
      invalidate();
      toast.success("Authorized code saved — NECTAR will keep its requirements live.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Removed from authorized set.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const archiveM = useMutation({
    mutationFn: (id: string) => archive({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Archived. Row is preserved (7-year retention).");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const unarchiveM = useMutation({
    mutationFn: (id: string) => unarchive({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Restored to your authorized set.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const confirmM = useMutation({
    mutationFn: (id: string) => confirmFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Confirmed — this code is verified as part of your contract.");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [newCode, setNewCode] = useState("");
  const [newSource, setNewSource] = useState<
    "manual" | "contract" | "sow" | "addendum"
  >("contract");

  const summary = data?.summary;

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
              When a standby code activates (e.g. a client gets SLH), the
              requirements are already in place — no scramble.
            </p>
          </div>
        </div>
      </div>

      {/* Prompt 35 — honest summary line */}
      {summary && (
        <div className="rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">
            {summary.authorized}
          </span>{" "}
          authorized
          <span className="opacity-60">·</span>
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">
            {summary.withActiveClients}
          </span>{" "}
          with active clients
          <span className="opacity-60">·</span>
          <span className="text-amber-700 dark:text-amber-300 font-medium">
            {summary.standby}
          </span>{" "}
          on standby
          {summary.archivedCount > 0 && (
            <>
              <span className="opacity-60">·</span>
              <span>{summary.archivedCount} archived</span>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs flex items-center gap-2">
              <Switch
                checked={showArchived}
                onCheckedChange={setShowArchived}
              />
              Show archived
            </label>
          </div>
        </div>
      )}

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
              onValueChange={(v) => setNewSource(v as typeof newSource)}
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
                { code: newCode.trim(), status: "dormant", source: newSource },
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
              {summary?.total ?? 0} total covered
            </Badge>
            <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              {summary?.withActiveClients ?? 0} with active clients
            </Badge>
            <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-300 border-amber-400/40">
              <Moon className="h-3 w-3" />
              {summary?.standby ?? 0} standby
            </Badge>
            {(summary?.inferredOnly ?? 0) > 0 && (
              <Badge variant="outline" className="gap-1 text-amber-600 border-amber-400/40">
                {summary!.inferredOnly} inferred from data — promote to lock
              </Badge>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {(data?.codes ?? []).map((row) => (
              <CodeRow
                key={row.id ?? `inferred-${row.code}`}
                row={row as CodeRowT}
                onPromote={() =>
                  upsertM.mutate({
                    code: row.code,
                    status: row.inUse ? "active" : "dormant",
                    source: "manual",
                  })
                }
                onConfirm={() => row.id && confirmM.mutate(row.id)}
                onArchive={() => row.id && archiveM.mutate(row.id)}
                onUnarchive={() => row.id && unarchiveM.mutate(row.id)}
                onRemove={() => row.id && removeM.mutate(row.id)}
                busy={
                  archiveM.isPending ||
                  unarchiveM.isPending ||
                  confirmM.isPending ||
                  removeM.isPending
                }
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
  onConfirm,
  onArchive,
  onUnarchive,
  onRemove,
  busy,
}: {
  row: CodeRowT;
  onPromote: () => void;
  onConfirm: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const isInferred = !row.id;
  const isArchived = row.displayStatus === "archived";

  return (
    <div className="p-4 flex flex-wrap items-center gap-3">
      <div className="font-mono text-base font-semibold tracking-tight min-w-[60px]">
        {row.code}
      </div>
      <div className="flex flex-wrap gap-1.5 grow items-center">
        <StatusChip status={row.displayStatus} />
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          {row.source}
        </Badge>
        {row.confirmed_at && (
          <Badge
            variant="outline"
            className="text-[10px] gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
          >
            <CheckCircle2 className="h-3 w-3" /> verified
          </Badge>
        )}
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
        {row.notes && !isArchived && (
          <span className="text-[11px] text-muted-foreground italic">
            {row.notes}
          </span>
        )}

        {/* Prompt 35 — confirm-or-archive prompt for unverified codes with no active client */}
        {row.displayStatus === "standby-unverified" && row.id && (
          <div className="w-full text-[11px] mt-1 flex flex-wrap items-center gap-2 text-amber-700 dark:text-amber-300">
            <HelpCircle className="h-3 w-3" />
            <span>Confirm this code belongs on your contract:</span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 disabled:opacity-50"
              onClick={onConfirm}
              disabled={busy}
            >
              Yes, keep it
            </button>
            <span className="opacity-40">·</span>
            <button
              type="button"
              className="underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100 disabled:opacity-50"
              onClick={onArchive}
              disabled={busy}
            >
              Archive (soft — never deleted)
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isInferred ? (
          <Button size="sm" variant="outline" onClick={onPromote}>
            Lock as authorized
          </Button>
        ) : isArchived ? (
          <Button
            size="sm"
            variant="outline"
            onClick={onUnarchive}
            disabled={busy}
            title="Restore to authorized set"
          >
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={onArchive}
              disabled={busy}
              title="Archive (soft — kept for 7-year retention)"
            >
              <Archive className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              disabled={busy}
              title="Remove entirely (rare — prefer archive)"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: CodeRowT["displayStatus"] }) {
  if (status === "active") {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Active
      </Badge>
    );
  }
  if (status === "standby") {
    return (
      <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1">
        <Moon className="h-3 w-3" /> Standby — no active client
      </Badge>
    );
  }
  if (status === "standby-unverified") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-400/40 text-amber-700 dark:text-amber-300"
      >
        <AlertTriangle className="h-3 w-3" /> Standby — unverified source
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Archive className="h-3 w-3" /> Archived
    </Badge>
  );
}
