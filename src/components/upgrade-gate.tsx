import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrgFeatures } from "@/hooks/use-feature-enabled";
import { requestFeatureUpgrade } from "@/lib/org-features.functions";

type Props = {
  featureKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional trigger content; when omitted the dialog is controlled purely by `open`. */
  children?: ReactNode;
};

/**
 * UpgradeGate — the bubble shown when a user clicks a locked feature.
 * Reads label / blurb / required_tier from the feature registry so copy
 * stays specific to the feature, and writes to feature_upgrade_requests
 * so HIVE Executives can fulfill by flipping the Master Controller toggle.
 */
export function UpgradeGate({ featureKey, open, onOpenChange }: Props) {
  const { getMeta, organizationId } = useOrgFeatures();
  const meta = getMeta(featureKey);
  const [submitted, setSubmitted] = useState(false);
  const requestFn = useServerFn(requestFeatureUpgrade);

  const mut = useMutation({
    mutationFn: () =>
      requestFn({
        data: {
          organizationId: organizationId!,
          featureKey,
        },
      }),
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Upgrade request sent to your HIVE Executive.");
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not send request";
      toast.error(msg);
    },
  });

  const label = meta?.label ?? featureKey;
  const blurb =
    meta?.upgrade_blurb ??
    `${label} isn't turned on for your organization yet.`;
  const tier = meta?.required_tier ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSubmitted(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#C8881E]/15">
            <Lock className="h-5 w-5 text-[#C8881E]" />
          </div>
          <DialogTitle className="flex items-center gap-2">
            {label}
            {tier && (
              <Badge variant="outline" className="uppercase tracking-wide text-[10px]">
                {tier}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm">{blurb}</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              Request sent. A HIVE Executive will review and enable{" "}
              <span className="font-medium">{label}</span> for your organization.
            </div>
          </div>
        ) : (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Requesting access notifies a HIVE Executive to enable this feature
            for your organization. Nothing changes until they approve.
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {submitted ? "Close" : "Not now"}
          </Button>
          {!submitted && (
            <Button
              onClick={() => mut.mutate()}
              disabled={mut.isPending || !organizationId}
              className="bg-[#1A2B47] text-white hover:bg-[#1A2B47]/90"
            >
              {mut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Request Upgrade
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Full-page gate wrapper for a route whose feature is OFF. Renders a
 * simple locked panel that opens the UpgradeGate dialog.
 */
export function FeatureLockedRoute({ featureKey }: { featureKey: string }) {
  const [open, setOpen] = useState(true);
  const { getMeta } = useOrgFeatures();
  const meta = getMeta(featureKey);
  const label = meta?.label ?? featureKey;
  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="rounded-xl border bg-white p-6 text-center">
        <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#C8881E]/15">
          <Lock className="h-5 w-5 text-[#C8881E]" />
        </div>
        <h1 className="text-lg font-semibold text-[#1A2B47]">{label} is locked</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta?.upgrade_blurb ?? "This feature isn't turned on for your organization yet."}
        </p>
        <Button className="mt-4 bg-[#1A2B47] text-white hover:bg-[#1A2B47]/90" onClick={() => setOpen(true)}>
          <Sparkles className="mr-2 h-4 w-4" /> Request Upgrade
        </Button>
      </div>
      <UpgradeGate featureKey={featureKey} open={open} onOpenChange={setOpen} />
    </div>
  );
}
