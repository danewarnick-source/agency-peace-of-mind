import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/hooks/use-permissions";
import {
  DEFAULT_MATCH_WEIGHTS,
  getProviderInterestOutline,
  saveProviderInterestOutline,
} from "@/lib/provider-interest-outline.functions";

type Mode = "anywhere" | "county" | "city";

function splitList(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ProviderInterestOutlineButton({
  organizationId,
}: {
  organizationId: string;
}) {
  const { can } = usePermissions();
  const canEdit = can("manage_referrals");
  const canView = canEdit || can("view_referrals");
  const [open, setOpen] = useState(false);

  if (!canView) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Settings2 className="h-4 w-4" /> Interest Outline
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Provider Interest Outline</DialogTitle>
        </DialogHeader>
        <OutlineEditor
          organizationId={organizationId}
          readOnly={!canEdit}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function OutlineEditor({
  organizationId,
  readOnly,
  onSaved,
}: {
  organizationId: string;
  readOnly: boolean;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getProviderInterestOutline);
  const saveFn = useServerFn(saveProviderInterestOutline);

  const q = useQuery({
    queryKey: ["provider-interest-outline", organizationId],
    queryFn: () => getFn({ data: { organization_id: organizationId } }),
  });

  const [mode, setMode] = useState<Mode>("anywhere");
  const [locations, setLocations] = useState("");
  const [codes, setCodes] = useState("");
  const [needLevels, setNeedLevels] = useState("");
  const [disabilityTypes, setDisabilityTypes] = useState("");
  const [disabilityLevels, setDisabilityLevels] = useState("");

  useEffect(() => {
    const o = q.data;
    if (!o) return;
    setMode(o.location_mode);
    setLocations((o.location_values ?? []).join(", "));
    setCodes((o.codes_held ?? []).join(", "));
    setNeedLevels((o.need_levels_served ?? []).join(", "));
    setDisabilityTypes((o.disability_types_served ?? []).join(", "));
    setDisabilityLevels((o.disability_levels_served ?? []).join(", "));
  }, [q.data]);

  const weights = useMemo(
    () => q.data?.match_weights ?? DEFAULT_MATCH_WEIGHTS,
    [q.data?.match_weights],
  );

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organization_id: organizationId,
          location_mode: mode,
          location_values: mode === "anywhere" ? [] : splitList(locations),
          codes_held: splitList(codes).map((c) => c.toUpperCase()),
          need_levels_served: splitList(needLevels),
          disability_types_served: splitList(disabilityTypes),
          disability_levels_served: splitList(disabilityLevels),
        },
      }),
    onSuccess: () => {
      toast.success("Interest Outline saved");
      qc.invalidateQueries({
        queryKey: ["provider-interest-outline", organizationId],
      });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const disabled = readOnly || save.isPending;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        What this provider will consider. NECTAR will score incoming referrals
        against this outline in a later increment.
        {readOnly && (
          <span className="ml-1 font-medium">
            Read-only — requires Manage referrals.
          </span>
        )}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Location preference</Label>
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anywhere">Anywhere</SelectItem>
              <SelectItem value="county">By county</SelectItem>
              <SelectItem value="city">By city</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="loc-values">
            {mode === "anywhere"
              ? "(not used)"
              : mode === "county"
                ? "Counties"
                : "Cities"}
          </Label>
          <Input
            id="loc-values"
            value={locations}
            onChange={(e) => setLocations(e.target.value)}
            disabled={disabled || mode === "anywhere"}
            placeholder={
              mode === "county"
                ? "Washington County, Salt Lake County"
                : "Murray, UT, St. George, UT"
            }
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="codes-held">Codes held (provider contract)</Label>
          <Input
            id="codes-held"
            value={codes}
            onChange={(e) => setCodes(e.target.value)}
            disabled={disabled}
            placeholder="HHS, RHS, SLN, SLH, SEI, DSI, COM"
          />
        </div>

        <div>
          <Label htmlFor="need-levels">Need levels served</Label>
          <Input
            id="need-levels"
            value={needLevels}
            onChange={(e) => setNeedLevels(e.target.value)}
            disabled={disabled}
            placeholder="T1, T2, T3"
          />
        </div>
        <div>
          <Label htmlFor="disability-levels">Disability levels served</Label>
          <Input
            id="disability-levels"
            value={disabilityLevels}
            onChange={(e) => setDisabilityLevels(e.target.value)}
            disabled={disabled}
            placeholder="mild, moderate, severe"
          />
        </div>

        <div className="md:col-span-2">
          <Label htmlFor="disability-types">Disability types served</Label>
          <Input
            id="disability-types"
            value={disabilityTypes}
            onChange={(e) => setDisabilityTypes(e.target.value)}
            disabled={disabled}
            placeholder="ID, ASD, physical, brain injury"
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/40 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          NECTAR match weights (default — tuner coming in v2)
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(weights).map(([k, v]) => (
            <Badge key={k} variant="secondary" className="text-[11px]">
              {k}: {Number(v).toFixed(2)}
            </Badge>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button
          onClick={() => save.mutate()}
          disabled={disabled}
          size="sm"
        >
          {save.isPending ? "Saving…" : "Save outline"}
        </Button>
      </DialogFooter>
    </div>
  );
}
