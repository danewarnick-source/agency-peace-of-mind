import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode } from "@/lib/scheduling/code-colors";
import {
  listClientWeeklyTargets,
  upsertClientWeeklyTarget,
  deleteClientWeeklyTarget,
} from "@/lib/scheduling/targets.functions";
import { listClientAuthorizedCodes } from "@/lib/scheduling/client-codes.functions";

interface ClientOpt { id: string; name: string }
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  clients: ClientOpt[];
}

/**
 * Per-client weekly target hours editor. Admins set the planned hours-per-week
 * for each (client, service code). Used by the host-home strip and the
 * over-target warning rule.
 */
export function WeeklyTargetsDialog({ open, onOpenChange, organizationId, clients }: Props) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [hours, setHours] = useState<string>("");
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  const listCall = useServerFn(listClientWeeklyTargets);
  const upsertCall = useServerFn(upsertClientWeeklyTarget);
  const deleteCall = useServerFn(deleteClientWeeklyTarget);
  const listCodesCall = useServerFn(listClientAuthorizedCodes);

  const targetsQ = useQuery({
    enabled: open && !!clientId,
    queryKey: ["client-weekly-targets", organizationId, clientId],
    queryFn: () => listCall({ data: { organizationId, clientId: clientId! } }),
  });

  const codesQ = useQuery({
    enabled: open && !!clientId,
    queryKey: ["client-auth-codes", organizationId, clientId],
    queryFn: () => listCodesCall({ data: { organizationId, clientId: clientId! } }),
  });

  const filteredClients = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? clients.filter((c) => c.name.toLowerCase().includes(f)) : clients;
  }, [clients, filter]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["client-weekly-targets", organizationId, clientId] });
  };

  async function handleSave() {
    if (!clientId || !code.trim() || !hours) return;
    const h = Number(hours);
    if (Number.isNaN(h) || h < 0 || h > 168) {
      toast.error("Hours must be 0–168");
      return;
    }
    setSaving(true);
    try {
      await upsertCall({
        data: {
          organizationId,
          clientId,
          serviceCode: code.trim(),
          targetHoursPerWeek: h,
          source: "manual",
        },
      });
      toast.success("Target saved");
      setCode("");
      setHours("");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCall({ data: { id } });
      toast.success("Target removed");
      invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Weekly hour targets</DialogTitle>
          <DialogDescription>
            Set planned hours-per-week per client &amp; service code. Used by host-home
            meters and the over-target warning.
          </DialogDescription>
        </DialogHeader>

        {!clientId ? (
          <div className="space-y-2">
            <Label>Client</Label>
            <Input placeholder="Search clients…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {filteredClients.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No clients</div>
              ) : filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setClientId(c.id)}
                  className="block w-full text-left px-3 py-2 text-sm hover:bg-muted min-h-[44px]"
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm">
                {clients.find((c) => c.id === clientId)?.name ?? "Client"}
              </div>
              <Button size="sm" variant="outline" onClick={() => { setClientId(null); setCode(""); setHours(""); }}>
                Change client
              </Button>
            </div>

            <div className="rounded-md border divide-y">
              {targetsQ.isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Loading…</div>
              ) : (targetsQ.data ?? []).length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No targets yet for this client.</div>
              ) : (targetsQ.data ?? []).map((t) => {
                const fc = classesForCode(t.service_code);
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge className={cn(fc.bgSoft, fc.text, fc.border, "border")}>{t.service_code}</Badge>
                      <span className="text-xs text-muted-foreground capitalize">
                        {familyForCode(t.service_code).replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{Number(t.target_hours_per_week).toFixed(1)} h/wk</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleDelete(t.id)}
                        aria-label="Remove target"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs">Add / update target</Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <Label className="text-[11px] text-muted-foreground">Service code</Label>
                  {(codesQ.data ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(codesQ.data ?? []).map((row) => {
                        const fc = classesForCode(row.service_code);
                        const on = code.toUpperCase() === row.service_code.toUpperCase();
                        return (
                          <button
                            key={row.id}
                            onClick={() => setCode(row.service_code)}
                            className={cn(
                              "min-h-[36px] rounded-md border px-2 text-xs font-semibold transition-colors",
                              on ? `${fc.border} ${fc.bgSoft} ring-2 ${fc.ring}` : "border-border hover:bg-muted",
                            )}
                          >
                            {row.service_code}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      placeholder="e.g. DSI"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                    />
                  )}
                </div>
                <div className="w-full sm:w-28">
                  <Label className="text-[11px] text-muted-foreground">Hours / week</Label>
                  <Input
                    type="number"
                    min={0}
                    max={168}
                    step={0.25}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={handleSave} disabled={saving || !code.trim() || !hours} className="w-full sm:w-auto">
                {saving ? "Saving…" : "Save target"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
