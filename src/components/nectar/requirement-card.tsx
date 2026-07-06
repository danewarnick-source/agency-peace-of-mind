import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  saveRequirementUsageNote,
  recategorizeRequirement,
  toggleRequirementOptionalConfirm,
} from "@/lib/nectar-requirement-usage.functions";
import { SourceCitationChip } from "./source-citation-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Lock,
  Pencil,
  History,
  Sparkles,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export type RequirementCardData = {
  id: string;
  original_title: string | null;
  original_description: string | null;
  original_source_citation: string | null;
  title: string;
  description: string | null;
  source_citation: string | null;
  obligation_category: string | null;
  obligation_category_source: "nectar" | "provider" | null;
  activation_state: string;
  confirmed_optional: boolean;
  service_code: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  admin_internal: "Administrative — Internal",
  admin_external: "Administrative — External (DWS, DACS, etc.)",
  client: "Client-specific",
  staff: "Staff/Employee-specific",
  provider_wide: "Provider-wide",
  billing_code: "Billing-code-specific",
};

/**
 * A single requirement rendered under an Authoritative Source. Original text
 * is locked; providers edit the usage note (append-only versioning), can
 * recategorize (logged), and can optionally mark as confirmed (non-blocking).
 */
export function RequirementCard({
  requirement,
  canEdit,
}: {
  requirement: RequirementCardData;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const saveNote = useServerFn(saveRequirementUsageNote);
  const recat = useServerFn(recategorizeRequirement);
  const toggleConfirm = useServerFn(toggleRequirementOptionalConfirm);

  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  // Current + full history from append-only usage table.
  const { data: history } = useQuery({
    queryKey: ["req-usage-history", requirement.id],
    queryFn: async () => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("nectar_requirement_usage" as any)
        .select("id, usage_note, edited_by, edited_at")
        .eq("requirement_id", requirement.id)
        .order("edited_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        usage_note: string;
        edited_by: string;
        edited_at: string;
      }>;
    },
  });

  const current = history?.[0];
  const hasProviderEdits = (history?.length ?? 0) > 0;

  const saveMut = useMutation({
    mutationFn: () =>
      saveNote({
        data: { requirementId: requirement.id, usageNote: noteDraft.trim() },
      }),
    onSuccess: () => {
      toast.success("Usage note saved");
      qc.invalidateQueries({ queryKey: ["req-usage-history", requirement.id] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recatMut = useMutation({
    mutationFn: (to: string) =>
      recat({
        data: {
          requirementId: requirement.id,
          toCategory: to as
            | "admin_internal"
            | "admin_external"
            | "client"
            | "staff"
            | "provider_wide"
            | "billing_code",
        },
      }),
    onSuccess: () => {
      toast.success("Category updated");
      qc.invalidateQueries({ queryKey: ["nectar-requirements"] });
      qc.invalidateQueries({ queryKey: ["authoritative-sources"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (checked: boolean) =>
      toggleConfirm({
        data: { requirementId: requirement.id, confirmed: checked },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["nectar-requirements"] }),
  });

  const originalTitle = requirement.original_title ?? requirement.title;
  const originalDescription =
    requirement.original_description ?? requirement.description;
  const originalCitation =
    requirement.original_source_citation ?? requirement.source_citation;

  const catLabel = requirement.obligation_category
    ? CATEGORY_LABELS[requirement.obligation_category] ?? requirement.obligation_category
    : "Uncategorized";

  return (
    <div className="rounded-md border border-border/60 bg-background p-3">
      {/* Header: activation state + badges */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {requirement.activation_state === "active" && (
          <Badge variant="secondary" className="text-[10px]">
            Active
          </Badge>
        )}
        {requirement.activation_state === "active_by_code" && (
          <Badge variant="secondary" className="text-[10px]">
            Active · code held
          </Badge>
        )}
        {requirement.activation_state === "pending_code_activation" && (
          <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-300">
            Pending code activation
          </Badge>
        )}
        {requirement.service_code && (
          <Badge variant="outline" className="text-[10px] font-mono">
            {requirement.service_code}
          </Badge>
        )}
        {hasProviderEdits ? (
          <Badge className="bg-blue-600 text-[10px] text-white hover:bg-blue-600">
            <UserCheck className="mr-0.5 h-3 w-3" />
            Provider-modified
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            <Sparkles className="mr-0.5 h-3 w-3" />
            NECTAR-drafted
          </Badge>
        )}
        {requirement.confirmed_optional && (
          <Badge className="bg-emerald-600 text-[10px] text-white hover:bg-emerald-600">
            <CheckCircle2 className="mr-0.5 h-3 w-3" />
            Confirmed
          </Badge>
        )}
      </div>

      {/* Original verbatim — LOCKED */}
      <div className="rounded-md bg-muted/40 p-2 text-sm">
        <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Lock className="h-3 w-3" /> Original source text · immutable
        </div>
        <div className="font-medium text-foreground">{originalTitle}</div>
        {originalDescription && (
          <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
            {originalDescription}
          </div>
        )}
        <div className="mt-2">
          <SourceCitationChip citation={originalCitation} />
        </div>
      </div>

      {/* Usage note — editable, append-only history */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            How NECTAR uses this
          </div>
          <div className="flex items-center gap-1">
            {(history?.length ?? 0) > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                    <History className="mr-1 h-3 w-3" />
                    History ({history!.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-96 max-h-80 overflow-y-auto">
                  <div className="space-y-3 text-xs">
                    {history!.map((h) => (
                      <div key={h.id} className="border-b border-border/40 pb-2 last:border-0">
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(h.edited_at), {
                            addSuffix: true,
                          })}{" "}
                          · {h.edited_by.slice(0, 8)}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap">{h.usage_note}</div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {canEdit && !editing && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setNoteDraft(current?.usage_note ?? "");
                  setEditing(true);
                }}
              >
                <Pencil className="mr-1 h-3 w-3" />
                {current ? "Edit" : "Add note"}
              </Button>
            )}
          </div>
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Explain how your agency handles this requirement operationally. NECTAR uses this to guide staff; the source text above is never overwritten."
              rows={4}
              className="text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!noteDraft.trim() || saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                Save note
              </Button>
            </div>
          </div>
        ) : current ? (
          <div className="rounded-md border border-dashed border-border/60 bg-background p-2 text-xs whitespace-pre-wrap">
            {current.usage_note}
          </div>
        ) : (
          <div className="text-xs italic text-muted-foreground">
            No provider usage note yet — NECTAR follows the source text as
            written.
          </div>
        )}
      </div>

      {/* Category + optional confirm */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Obligation
          </span>
          {canEdit ? (
            <Select
              value={requirement.obligation_category ?? ""}
              onValueChange={(v) => recatMut.mutate(v)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[220px] text-xs">
                <SelectValue placeholder="Uncategorized">
                  <span className="flex items-center gap-1.5">
                    {catLabel}
                    {requirement.obligation_category_source === "nectar" && (
                      <span className="text-[10px] italic text-amber-700 dark:text-amber-300">
                        · NECTAR-classified · edit
                      </span>
                    )}
                    {requirement.obligation_category_source === "provider" && (
                      <span className="text-[10px] italic text-muted-foreground">
                        · provider-set
                      </span>
                    )}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-xs">{catLabel}</span>
          )}
        </div>
        {canEdit && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={requirement.confirmed_optional}
              onChange={(e) => confirmMut.mutate(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Confirm requirement (optional)
          </label>
        )}
      </div>
    </div>
  );
}
