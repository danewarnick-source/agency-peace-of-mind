import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getStaffClientSpecificTraining,
  completeClientSpecificTraining,
  type CSTContent,
} from "@/lib/client-specific-training.functions";
import { SectionsView } from "@/components/clients/client-specific-training-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, Shield, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/client-training/$clientId")({
  component: ClientTrainingViewer,
});

function ClientTrainingViewer() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getStaffClientSpecificTraining);
  const completeFn = useServerFn(completeClientSpecificTraining);
  const [signature, setSignature] = useState("");

  const queryKey = ["staff-client-training", clientId];
  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => getFn({ data: { clientId } }),
    retry: false,
  });

  const completeMut = useMutation({
    mutationFn: () => completeFn({ data: { clientId, typedSignature: signature.trim() } }),
    onSuccess: () => {
      toast.success("Client-specific training completed — record saved.");
      qc.invalidateQueries({ queryKey });
      setSignature("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{(error as Error).message}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const training = data?.training ?? null;
  const completion = data?.completion ?? null;
  const pinned = data?.pinnedToCurrent ?? false;

  if (!training) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">No published client-specific training is available for this client yet.</p>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/dashboard" })}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  const alreadyCurrent = completion?.is_current && pinned;

  return (
    <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-background md:min-h-[600px]">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Link>
          </Button>
        </div>
        <div className="mt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
            Client-Specific Training · v{training.version}
          </p>
          <h1 className="mt-0.5 text-base font-semibold leading-snug tracking-tight">{training.title}</h1>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto bg-card px-4 py-4 space-y-4">
        <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 flex gap-2">
          <Shield className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            This content is your agency's published snapshot of this client's documented needs. Review every section carefully — your typed-name attestation is recorded.
          </span>
        </div>

        <SectionsView
          content={training.content as CSTContent}
          editing={false}
          onChange={() => {}}
        />
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 space-y-2">
        {alreadyCurrent ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Completed for the current version on{" "}
            {completion?.completed_at ? new Date(completion.completed_at).toLocaleDateString() : ""}.
          </div>
        ) : (
          <>
            {completion && !pinned && (
              <p className="text-[11px] text-amber-800">
                You previously completed an earlier version. The training has been updated — please re-attest.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">Attestation:</span> {training.attestation_statement}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Label htmlFor="sig" className="sr-only">Typed name signature</Label>
                <Input
                  id="sig"
                  placeholder="Type your full name to sign"
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  maxLength={120}
                />
              </div>
              <Button
                onClick={() => completeMut.mutate()}
                disabled={completeMut.isPending || signature.trim().length < 3}
                className="bg-[image:var(--gradient-brand)] text-primary-foreground"
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {completeMut.isPending ? "Saving…" : "Sign & Complete"}
              </Button>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
