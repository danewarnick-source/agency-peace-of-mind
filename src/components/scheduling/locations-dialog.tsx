import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listLocations, createLocation, updateLocation } from "@/lib/scheduling/locations.functions";

type LocationType = "residential" | "host_home" | "day_site" | "community";

const TYPES: { value: LocationType; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "host_home", label: "Host home" },
  { value: "day_site", label: "Day site" },
  { value: "community", label: "Community" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
}

/**
 * Locations admin — create/edit/disable locations used by the scheduler.
 * Locations drive the coverage requirements editor and the day timeline.
 */
export function LocationsDialog({ open, onOpenChange, organizationId }: Props) {
  const qc = useQueryClient();
  const listCall = useServerFn(listLocations);
  const createCall = useServerFn(createLocation);
  const updateCall = useServerFn(updateLocation);

  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("residential");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const locsQ = useQuery({
    enabled: open,
    queryKey: ["locations", organizationId],
    queryFn: () => listCall({ data: { organizationId } }),
  });

  const sorted = useMemo(
    () => [...(locsQ.data ?? [])].sort((a, b) => (a.sort ?? 100) - (b.sort ?? 100)),
    [locsQ.data],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["locations", organizationId] });

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createCall({
        data: { organizationId, name: name.trim(), type, address: address.trim() || undefined },
      });
      toast.success("Location added");
      setName(""); setAddress("");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  async function handleToggleActive(id: string, active: boolean) {
    try {
      await updateCall({ data: { id, active: !active } });
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function handleRename(id: string, current: string) {
    const next = window.prompt("Rename location", current);
    if (!next || next.trim() === current) return;
    try {
      await updateCall({ data: { id, name: next.trim() } });
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Rename failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Locations</DialogTitle>
          <DialogDescription>
            Places where shifts happen — homes, host homes, day sites, community.
            Used by coverage rules and the day timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border divide-y">
          {locsQ.isLoading ? (
            <div className="p-3 text-sm text-muted-foreground">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">No locations yet.</div>
          ) : sorted.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-semibold text-sm truncate ${l.active === false ? "line-through text-muted-foreground" : ""}`}>{l.name}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{(l.type ?? "").replace("_", " ")}</Badge>
                </div>
                {l.address && <div className="text-[11px] text-muted-foreground truncate">{l.address}</div>}
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="min-h-[36px]" onClick={() => handleRename(l.id, l.name)}>Rename</Button>
                <Button variant="ghost" size="sm" className="min-h-[36px]" onClick={() => handleToggleActive(l.id, l.active !== false)}>
                  {l.active === false ? "Restore" : "Disable"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <Label className="text-xs">Add location</Label>
          <Input placeholder="Name (e.g. Maple St)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="flex flex-wrap gap-1">
            {TYPES.map((t) => {
              const on = type === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={`min-h-[36px] rounded-md border px-2 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <Input placeholder="Address (optional)" value={address} onChange={(e) => setAddress(e.target.value)} />
          <Button onClick={handleCreate} disabled={saving || !name.trim()} className="w-full sm:w-auto">
            {saving ? "Saving…" : "Add location"}
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
