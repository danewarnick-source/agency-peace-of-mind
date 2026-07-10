/**
 * Shared visibility toggle UI. Two components:
 *   • <SectionVisibilityToggle> — one per section (hard override).
 *   • <FieldVisibilityToggle>   — per-field eye/eye-off icon.
 *
 * Both write through `setClientStaffVisibility` and invalidate the
 * `client-care-data` query keys so every staff surface refreshes.
 *
 * We use a local `pending` boolean around an awaited server-fn call
 * (instead of react-query's useMutation) so the "in progress" state is
 * guaranteed to clear in the finally block, even if the server response
 * is malformed HTML (e.g. a preview warmup page) that would otherwise
 * leave a mutation stuck.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { clientCareDataQueryOptions } from "@/lib/client-care-data.functions";
import { setClientStaffVisibility } from "@/lib/client-staff-visibility.functions";
import {
  SECTION_DEFAULTS,
  SECTION_LABEL,
  isFieldVisible,
  isSectionVisible,
  type SectionName,
} from "@/lib/client-staff-visibility";

function useVisibility(clientId: string) {
  const qc = useQueryClient();
  const setFn = useServerFn(setClientStaffVisibility);
  const q = useQuery(clientCareDataQueryOptions(clientId));
  const [pending, setPending] = useState(false);

  const save = async (input: Parameters<typeof setFn>[0]["data"]) => {
    setPending(true);
    try {
      await setFn({ data: input });
      qc.invalidateQueries({ queryKey: ["client-care-data", clientId] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update visibility";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return { data: q.data, save, pending };
}

export function SectionVisibilityToggle({
  clientId,
  section,
}: {
  clientId: string;
  section: SectionName;
}) {
  const { data, save, pending } = useVisibility(clientId);
  const on = data ? isSectionVisible(data.visibilityRow, section) : SECTION_DEFAULTS[section];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 mb-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">
          Staff can see this section{on ? "" : " — hidden"}
        </div>
        <div className="text-xs text-muted-foreground">
          {on
            ? `Staff-facing surfaces show ${SECTION_LABEL[section]} fields (subject to individual field toggles below).`
            : `Nothing in ${SECTION_LABEL[section]} reaches staff, regardless of individual field settings.`}
          {" "}Default:{" "}{SECTION_DEFAULTS[section] ? "on" : "off"}.
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <Switch
          checked={on}
          disabled={pending}
          onCheckedChange={(v) => save({ clientId, sectionPatch: { [section]: v } })}
          aria-label={`Toggle ${SECTION_LABEL[section]} visibility for staff`}
        />
      </div>
    </div>
  );
}

export function FieldVisibilityToggle({
  clientId,
  section,
  kind,
  id,
  label,
}: {
  clientId: string;
  section: SectionName;
  kind: "field" | "goal" | "medication" | "code" | "custom";
  id: string;
  label?: string;
}) {
  const { data, save, pending } = useVisibility(clientId);
  const key = `${section}.${kind}:${id}`;
  const visible = data ? isFieldVisible(data.visibilityRow, key) : true;
  const sectionOn = data ? isSectionVisible(data.visibilityRow, section) : SECTION_DEFAULTS[section];

  const disabled = !sectionOn || pending;
  const tooltip = !sectionOn
    ? `Section is hidden from staff — turn on ${SECTION_LABEL[section]} to control ${label ?? "this field"} individually.`
    : visible
      ? `Visible to staff. Click to hide ${label ?? "this field"}.`
      : `Hidden from staff. Click to show ${label ?? "this field"}.`;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            aria-label={tooltip}
            disabled={disabled}
            onClick={() => save({ clientId, fieldPatch: { [key]: !visible } })}
          >
            {visible ? (
              <Eye className="h-4 w-4 text-muted-foreground" />
            ) : (
              <EyeOff className="h-4 w-4 text-amber-600" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
