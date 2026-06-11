import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  copyPreviousWeek, saveWeekAsTemplate, listWeekTemplates, applyWeekTemplate,
  deleteWeekTemplate,
} from "@/lib/scheduling/week-templates.functions";

interface Props {
  organizationId: string;
  weekStart: Date;
  onApplied?: () => void;
}

export function CopyWeekMenu({ organizationId, weekStart, onApplied }: Props) {
  const qc = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  const listFn = useServerFn(listWeekTemplates);
  const copyPrevFn = useServerFn(copyPreviousWeek);
  const saveFn = useServerFn(saveWeekAsTemplate);
  const applyFn = useServerFn(applyWeekTemplate);
  const delFn = useServerFn(deleteWeekTemplate);

  const templates = useQuery({
    enabled: !!organizationId,
    queryKey: ["week-templates", organizationId],
    queryFn: () => listFn({ data: { organizationId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["schedule-preview"] });
    onApplied?.();
  };

  const copyPrev = useMutation({
    mutationFn: () => copyPrevFn({ data: { organizationId, targetWeekStartIso: weekStart.toISOString() } }),
    onSuccess: (r) => { toast.success(`Copied ${r.count} shifts as drafts.`); invalidate(); },
    onError: (e: Error) => toast.error(e.message || "Could not copy."),
  });

  const save = useMutation({
    mutationFn: () => saveFn({ data: { organizationId, weekStartIso: weekStart.toISOString(), name: name.trim() } }),
    onSuccess: (r) => {
      toast.success(`Saved template (${r.count} shifts).`);
      setSaveOpen(false); setName("");
      qc.invalidateQueries({ queryKey: ["week-templates", organizationId] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save."),
  });

  const apply = useMutation({
    mutationFn: (templateId: string) =>
      applyFn({ data: { organizationId, templateId, targetWeekStartIso: weekStart.toISOString() } }),
    onSuccess: (r) => { toast.success(`Applied ${r.count} shifts as drafts.`); invalidate(); },
    onError: (e: Error) => toast.error(e.message || "Could not apply."),
  });

  const del = useMutation({
    mutationFn: (templateId: string) => delFn({ data: { organizationId, templateId } }),
    onSuccess: () => { toast.success("Template deleted."); qc.invalidateQueries({ queryKey: ["week-templates", organizationId] }); },
    onError: (e: Error) => toast.error(e.message || "Could not delete."),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted">
            <Copy className="h-3.5 w-3.5" /> Copy from…
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onClick={() => copyPrev.mutate()} disabled={copyPrev.isPending}>
            {copyPrev.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Copy previous week
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            Save current week as template…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Apply template
          </DropdownMenuLabel>
          {(templates.data ?? []).length === 0 ? (
            <DropdownMenuItem disabled>No saved templates</DropdownMenuItem>
          ) : (
            (templates.data ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-1 px-2 py-1">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-xs hover:underline"
                  onClick={() => apply.mutate(t.id)}
                  disabled={apply.isPending}
                >
                  {t.name}
                </button>
                <button
                  type="button"
                  aria-label="Delete template"
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete template "${t.name}"?`)) del.mutate(t.id); }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save week as template</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>Template name</Label>
            <Input
              placeholder="e.g. Standard weekday rotation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending}>
              {save.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
