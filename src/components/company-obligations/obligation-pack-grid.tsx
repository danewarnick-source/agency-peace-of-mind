import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  FileText,
  Lock,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ManualCompletionDrawer } from "@/components/company-obligations/manual-completion-drawer";
import {
  deleteCustomPack,
  listObligationPackMatrix,
  type PackMatrixCell,
} from "@/lib/obligation-packs.functions";
import { AddPackItemDialog, AssignPackDialog, CreatePackDialog } from "./pack-dialogs";

type StatusFilter = "all" | "incomplete" | "complete";

function cellClasses(status: PackMatrixCell["status"]): string {
  if (status === "complete") {
    return "bg-[color-mix(in_srgb,var(--hive-ok)_16%,white)] text-[var(--hive-ok)]";
  }
  if (status === "incomplete") {
    return "bg-[color-mix(in_srgb,var(--hive-danger)_12%,white)] text-[var(--hive-danger)]";
  }
  if (status === "optional_empty") {
    return "bg-[#eef1f4] text-[var(--hive-text-muted)]";
  }
  return "bg-transparent text-[var(--hive-text-muted)]";
}

function ProgressBar({ complete, total }: { complete: number; total: number }) {
  const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
  return (
    <div
      className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--hive-border)]"
      aria-label={`${pct} percent complete`}
    >
      <div
        className="h-full rounded-full bg-[var(--hive-ok)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ObligationPackGrid({
  orgId,
  packKey,
  onPackKeyChange,
}: {
  orgId: string;
  packKey: string;
  onPackKeyChange: (key: string) => void;
}) {
  const qc = useQueryClient();
  const matrixFn = useServerFn(listObligationPackMatrix);
  const deleteFn = useServerFn(deleteCustomPack);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "existing" | "upload" | "attest">("choose");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [activeCell, setActiveCell] = useState<PackMatrixCell | null>(null);

  const q = useQuery({
    queryKey: ["obligation-pack-matrix", orgId, packKey],
    queryFn: () => matrixFn({ data: { organizationId: orgId, packKey } }),
    staleTime: 15_000,
  });

  const matrix = q.data;
  const currentPack = matrix?.packs.find((p) => p.packKey === packKey) ?? matrix?.packs[0];
  const cellByKey = useMemo(() => {
    const m = new Map<string, PackMatrixCell>();
    for (const c of matrix?.cells ?? []) m.set(`${c.staffId}:${c.columnKey}`, c);
    return m;
  }, [matrix?.cells]);

  const staffRows = useMemo(() => {
    const qn = search.trim().toLowerCase();
    return (matrix?.staff ?? []).filter((s) => {
      if (qn && !s.full_name.toLowerCase().includes(qn)) return false;
      const cells = (matrix?.columns ?? []).map(
        (col) => cellByKey.get(`${s.id}:${col.columnKey}`),
      );
      const hasRed = cells.some((c) => c?.status === "incomplete");
      const hasAssigned = cells.some((c) => c?.assigned);
      const allAssignedComplete =
        hasAssigned && cells.filter((c) => c?.assigned).every((c) => c?.complete);
      if (status === "incomplete") return hasRed;
      if (status === "complete") return allAssignedComplete && !hasRed;
      return true;
    });
  }, [matrix?.staff, matrix?.columns, cellByKey, search, status]);

  const delMut = useMutation({
    mutationFn: () => deleteFn({ data: { organizationId: orgId, packKey } }),
    onSuccess: () => {
      toast.success("Pack removed");
      void qc.invalidateQueries({ queryKey: ["obligation-pack-matrix"] });
      onPackKeyChange("onboarding");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const redTotal = (matrix?.columns ?? []).reduce((n, c) => n + c.redCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--hive-text)]">Obligations</h2>
          <p className="mt-0.5 max-w-xl text-sm text-[var(--hive-text-muted)]">
            Packs across the top. Staff down the left. Required cells are green or red; optional
            cells stay quiet.
          </p>
        </div>
        {redTotal > 0 && (
          <p className="text-xs font-medium text-[var(--hive-danger)]">
            {redTotal} required incomplete
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-[var(--hive-border)]">
        {(matrix?.packs ?? []).map((pack) => {
          const active = pack.packKey === packKey;
          return (
            <button
              key={pack.packKey}
              type="button"
              onClick={() => onPackKeyChange(pack.packKey)}
              className={`relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm ${
                active
                  ? "font-semibold text-[var(--hive-ink)]"
                  : "text-[var(--hive-text-muted)] hover:text-[var(--hive-text)]"
              }`}
            >
              {pack.locked && <Lock className="h-3 w-3" />}
              {pack.name}
              {active && (
                <span className="absolute inset-x-2 bottom-0 h-px bg-[var(--hive-gold)]" />
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="mb-0.5 ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--hive-border)] text-[var(--hive-text-muted)] hover:bg-[#eef1f4]"
          aria-label="Add pack"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--hive-text-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff"
            className="h-8 w-56 pl-8 text-sm"
          />
        </div>
        <div className="flex rounded-md border border-[var(--hive-border)] p-0.5">
          {(
            [
              ["all", "All"],
              ["incomplete", "Incomplete"],
              ["complete", "Complete"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                status === key
                  ? "bg-[var(--hive-ink)] text-white"
                  : "text-[var(--hive-text-muted)] hover:bg-[#eef1f4]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
            <Settings2 className="h-3.5 w-3.5" />
            Assign pack
          </Button>
          {!currentPack?.locked && (
            <Button
              variant="outline"
              size="sm"
              disabled={delMut.isPending}
              onClick={() => {
                if (window.confirm("Remove this pack and its custom items?")) delMut.mutate();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete pack
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setAddStep("existing");
                  setAddOpen(true);
                }}
              >
                Existing item
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAddStep("upload");
                  setAddOpen(true);
                }}
              >
                Request document upload
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setAddStep("attest");
                  setAddOpen(true);
                }}
              >
                Document to complete or attest
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {q.isError ? (
        <div className="rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)] p-6 text-sm text-[var(--hive-text-muted)]">
          Could not load the pack grid.{" "}
          <button type="button" className="underline" onClick={() => void q.refetch()}>
            Try again
          </button>
        </div>
      ) : q.isLoading ? (
        <p className="text-sm text-[var(--hive-text-muted)]">Loading pack…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--hive-border)] bg-[var(--hive-surface)]">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--hive-border)]">
                <th className="sticky left-0 z-10 min-w-[12rem] bg-[var(--hive-surface)] px-3 py-2 text-left text-xs font-medium text-[var(--hive-text-muted)]">
                  Staff
                </th>
                {(matrix?.columns ?? []).map((col) => (
                  <th
                    key={col.columnKey}
                    className="min-w-[7.5rem] px-2 py-2 text-left font-medium text-[var(--hive-text)]"
                  >
                    <span className="block truncate text-xs" title={col.label}>
                      {col.label}
                    </span>
                    {!col.required && (
                      <span className="block text-[10px] font-normal text-[var(--hive-text-muted)]">
                        Optional
                      </span>
                    )}
                    <ProgressBar complete={col.completeCount} total={col.assignedCount} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staffRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={Math.max(1, (matrix?.columns.length ?? 0) + 1)}
                    className="px-3 py-8 text-center text-sm text-[var(--hive-text-muted)]"
                  >
                    {matrix?.columns.length
                      ? "No staff match this filter."
                      : "No items on this pack yet. Add an item or wait for the live register to load."}
                  </td>
                </tr>
              ) : (
                staffRows.map((person) => (
                  <tr key={person.id} className="border-t border-[var(--hive-border)]">
                    <td className="sticky left-0 z-10 bg-[var(--hive-surface)] px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#e4e8ed] text-[10px] font-semibold text-[var(--hive-ink)]">
                          {person.initials}
                        </span>
                        <span className="truncate font-medium">{person.full_name}</span>
                      </div>
                    </td>
                    {(matrix?.columns ?? []).map((col) => {
                      const cell = cellByKey.get(`${person.id}:${col.columnKey}`);
                      const status = cell?.status ?? "unassigned";
                      return (
                        <td key={col.columnKey} className="px-2 py-1.5">
                          <button
                            type="button"
                            disabled={!cell?.assigned}
                            onClick={() => {
                              if (!cell?.assigned) return;
                              setActiveCell(cell);
                              setCompleteOpen(true);
                            }}
                            className={`flex h-9 w-full items-center justify-center rounded-md ${cellClasses(status)} ${
                              cell?.assigned ? "cursor-pointer" : "cursor-default"
                            }`}
                            aria-label={`${person.full_name} ${col.label} ${status}`}
                          >
                            {status === "complete" && <Check className="h-4 w-4" />}
                            {status === "incomplete" && <FileText className="h-4 w-4" />}
                            {status === "optional_empty" && (
                              <span className="text-[10px] uppercase tracking-wide">Optional</span>
                            )}
                            {status === "unassigned" && <UserRound className="h-3.5 w-3.5 opacity-30" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <CreatePackDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        jobCodes={matrix?.jobCodes ?? []}
        onCreated={onPackKeyChange}
      />
      {currentPack && (
        <AssignPackDialog
          open={assignOpen}
          onOpenChange={setAssignOpen}
          orgId={orgId}
          packKey={currentPack.packKey}
          packName={currentPack.name}
          locked={currentPack.locked}
          initial={currentPack.assign}
          jobCodes={matrix?.jobCodes ?? []}
        />
      )}
      <AddPackItemDialog
        open={addOpen}
        onOpenChange={(v) => {
          setAddOpen(v);
          if (!v) setAddStep("choose");
        }}
        orgId={orgId}
        packKey={packKey}
        packName={currentPack?.name ?? "Pack"}
        matrix={matrix}
        initialStep={addStep}
      />
      <ManualCompletionDrawer
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        orgId={orgId}
        instanceId={activeCell?.instanceId ?? null}
        obligationId={activeCell?.obligationId ?? undefined}
        evidenceType={
          (matrix?.columns.find((c) => c.columnKey === activeCell?.columnKey)?.evidenceType as
            | "attestation"
            | "upload"
            | "upload_and_attestation"
            | "form"
            | undefined) ?? null
        }
      />
    </div>
  );
}
