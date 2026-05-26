import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

type Status = "Unanswered" | "Accepted" | "Declined";

/**
 * One-time blocking modal that captures Federal EVV GPS consent. Wraps the
 * EVV time clock UI; renders children only after consent is on file.
 */
export function EvvConsentGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await supabase
        .from("profiles")
        .select("evv_gps_consent_status")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("id", user.id as any)
        .maybeSingle();
      if (cancelled) return;
      const v = (data as { evv_gps_consent_status?: Status } | null)
        ?.evv_gps_consent_status;
      setStatus(v ?? "Unanswered");
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  async function record(decision: "Accepted" | "Declined") {
    if (!user?.id) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          evv_gps_consent_status: decision,
          evv_consent_timestamp: new Date().toISOString(),
        } as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("id", user.id as any);
      if (error) throw error;
      setStatus(decision);
      if (decision === "Declined") {
        toast.error("EVV consent declined — time clock access disabled.");
        navigate({ to: "/dashboard" });
      } else {
        toast.success("EVV consent recorded.");
      }
    } catch (e) {
      toast.error((e as Error).message || "Could not record consent.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === null) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading EVV consent…
      </div>
    );
  }

  if (status === "Accepted") return <>{children}</>;

  // Declined or Unanswered — show blocking overlay.
  const declined = status === "Declined";

  return (
    <>
      {/* Render children dimmed/inert behind overlay so layout doesn't jump */}
      <div aria-hidden className="pointer-events-none select-none opacity-40 blur-[1px]">
        {children}
      </div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evv-consent-title"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6"
      >
        <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border bg-primary/5 px-4 py-3 sm:px-6 sm:py-4">
            <h2
              id="evv-consent-title"
              className="flex items-center gap-2 text-base font-semibold sm:text-lg"
            >
              <ShieldCheck className="h-5 w-5 text-primary" />
              🛡️ Federal EVV Location Tracking Consent &amp; Disclosure
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed text-muted-foreground sm:px-6">
            <p>
              Pursuant to the Federal 21st Century Cures Act and Utah DHHS
              Medicaid mandate regulations, this platform utilizes Electronic
              Visit Verification (EVV) telemetry to verify service delivery
              location via your device&apos;s GPS tracking capabilities during
              active shift hours. Location data is captured exclusively at the
              precise moments of Clock-In and Clock-Out actions to validate
              compliance parameters. Continuous background tracking is never
              executed outside of active service hours.
            </p>

            {declined && (
              <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                You previously declined EVV tracking. You must accept to access
                the time clock. Contact your administrator if this was in error.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
            <Button
              variant="outline"
              className="h-12 w-full sm:w-auto"
              onClick={() => record("Declined")}
              disabled={submitting}
            >
              Decline &amp; Exit
            </Button>
            <Button
              className="h-12 w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
              onClick={() => record("Accepted")}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              I Consent &amp; Allow Tracking
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
