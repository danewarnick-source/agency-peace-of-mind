import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ClipboardCheck, User, Eraser, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/daily-logs")({
  head: () => ({ meta: [{ title: "Daily Logs — Care Academy" }] }),
  component: DailyLogsPage,
});

type Client = {
  id: string;
  first_name: string;
  last_name: string;
  pcsp_goals: string[];
};

const MIN_NARRATIVE = 50;

function DailyLogsPage() {
  const { data: org } = useCurrentOrg();
  const [activeClient, setActiveClient] = useState<Client | null>(null);

  const { data: clients, isLoading } = useQuery({
    enabled: !!org,
    queryKey: ["daily-log-clients", org?.organization_id],
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from("clients")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, first_name, last_name, pcsp_goals" as any)
        .eq("organization_id", org!.organization_id)
        .order("last_name");
      if (error) throw error;
      return (data ?? []) as unknown as Client[];
    },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Daily Logs</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Host Home Daily Compliance Journal. Select a client to submit today's PCSP narrative and signature.
        </p>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12 text-sm text-muted-foreground">Loading clients…</div>
      ) : !clients?.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No clients assigned. Ask your administrator to add clients in the Clients tab.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveClient(c)}
              className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <User className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.first_name} {c.last_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.pcsp_goals?.length ?? 0} PCSP goal{(c.pcsp_goals?.length ?? 0) === 1 ? "" : "s"} on file
                </p>
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100">
                  <ClipboardCheck className="h-3 w-3" /> Open daily journal
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <DailyLogDialog
        client={activeClient}
        onClose={() => setActiveClient(null)}
      />
    </div>
  );
}

function DailyLogDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const [goals, setGoals] = useState<string[]>([]);
  const [narrative, setNarrative] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const hasSignatureRef = useRef(false);

  useEffect(() => {
    if (client) {
      setGoals([]);
      setNarrative("");
      hasSignatureRef.current = false;
      // clear canvas after open
      setTimeout(() => clearCanvas(), 0);
    }
  }, [client?.id]);

  const remaining = Math.max(0, MIN_NARRATIVE - narrative.trim().length);
  const canSubmit = goals.length > 0 && narrative.trim().length >= MIN_NARRATIVE && hasSignatureRef.current && !submitting;

  function toggleGoal(g: string) {
    setGoals((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  function getCanvasCtx() {
    const c = canvasRef.current;
    if (!c) return null;
    return c.getContext("2d");
  }

  function clearCanvas() {
    const c = canvasRef.current;
    const ctx = getCanvasCtx();
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    hasSignatureRef.current = false;
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCanvasCtx();
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getCanvasCtx();
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasSignatureRef.current = true;
  }
  function onPointerUp() {
    drawingRef.current = false;
  }

  async function submit() {
    if (!user || !org || !client) return;
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const signature = canvasRef.current?.toDataURL("image/png") ?? null;
      const { error } = await supabase
        .from("daily_logs")
        .insert({
          organization_id: org.organization_id,
          user_id: user.id,
          client_id: client.id,
          pcsp_goals_addressed: goals,
          narrative: narrative.trim(),
          signature_data_url: signature,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      if (error) throw error;
      toast.success("Daily Host Home log submitted");
      qc.invalidateQueries({ queryKey: ["daily-log-clients"] });
      onClose();
    } catch (e) {
      toast.error((e as Error).message || "Could not submit log");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Daily Summary Journal</DialogTitle>
          <DialogDescription>
            {client ? `${client.first_name} ${client.last_name} — ${new Date().toLocaleDateString()}` : ""}
          </DialogDescription>
        </DialogHeader>

        {client && (
          <div className="space-y-5">
            <div>
              <Label className="mb-2 block text-sm font-medium">PCSP goals addressed today</Label>
              {client.pcsp_goals?.length ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  {client.pcsp_goals.map((g) => (
                    <label key={g} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={goals.includes(g)}
                        onCheckedChange={() => toggleGoal(g)}
                        className="mt-0.5"
                      />
                      <span>{g}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  No PCSP goals on file for this client. Add them in the Clients tab first.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="narrative" className="mb-2 block text-sm font-medium">
                Narrative summary
              </Label>
              <Textarea
                id="narrative"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="Describe today's care, activities, mood, meals, incidents, and any goal progress…"
                rows={5}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {remaining > 0
                  ? `${remaining} more character${remaining === 1 ? "" : "s"} required (minimum ${MIN_NARRATIVE}).`
                  : `${narrative.trim().length} characters — minimum met.`}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label className="text-sm font-medium">Caregiver signature</Label>
                <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>
                  <Eraser className="mr-1 h-3.5 w-3.5" /> Clear
                </Button>
              </div>
              <canvas
                ref={canvasRef}
                width={600}
                height={180}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className="block w-full touch-none rounded-lg border border-border bg-white"
                style={{ height: 180 }}
              />
              <p className="mt-1 text-xs text-muted-foreground">Sign with your finger or mouse to attest this entry.</p>
            </div>

            <Button onClick={submit} disabled={!canSubmit} className="w-full">
              {submitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…</>
              ) : (
                <><CheckCircle2 className="mr-2 h-4 w-4" /> Submit Daily Host Home Log</>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
