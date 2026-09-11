import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  confirmFailedObligationCompletion,
  getCertReview,
  requestObligationCorrection,
  type CertReviewRow,
} from "@/lib/company-obligations.functions";
import {
  CERT_REVIEW_AI_NOTE,
  canAcceptCertEvidence,
  certReviewAcceptBlockReason,
  certReviewStatus,
  certReviewStatusLabel,
} from "@/lib/cert-review";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function asReview(data: unknown): CertReviewRow | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as CertReviewRow & { result?: CertReviewRow };
  if (rec.completionId) return rec;
  return rec.result ?? null;
}

export function CertReviewPanel({ completionId }: { completionId: string }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id ?? null;
  const qc = useQueryClient();
  const load = useServerFn(getCertReview);
  const acceptFn = useServerFn(confirmFailedObligationCompletion);
  const correctFn = useServerFn(requestObligationCorrection);
  const [confirmedExpires, setConfirmedExpires] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const q = useQuery({
    enabled: !!orgId && !!completionId,
    queryKey: ["cert-review", orgId, completionId],
    queryFn: () => load({ data: { organizationId: orgId!, completionId } }),
  });
  const review = asReview(q.data);

  useEffect(() => {
    if (review?.extractedExpiresOn) setConfirmedExpires(review.extractedExpiresOn);
  }, [review?.extractedExpiresOn]);

  useEffect(() => {
    if (!review?.uploadPath) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    (supabase as any).storage
      .from("obligation-evidence")
      .createSignedUrl(review.uploadPath, 300)
      .then((res: { data?: { signedUrl?: string } | null }) => {
        if (!cancelled) setPreviewUrl(res.data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [review?.uploadPath]);

  const decision = {
    usesCertExpiration: review?.usesCertExpiration ?? false,
    extractedExpiresOn: review?.extractedExpiresOn ?? null,
    confirmedExpiresOn: confirmedExpires.trim() || null,
  };
  const canAccept = review ? canAcceptCertEvidence(decision) : false;
  const block = review ? certReviewAcceptBlockReason(decision) : null;
  const status = review
    ? certReviewStatus({
        nectarValidationStatus: review.nectarValidationStatus,
        instanceStatus: review.instanceStatus,
        correctionRequested: review.correctionRequested,
      })
    : "awaiting_review";

  const accept = useMutation({
    mutationFn: () => {
      if (!orgId || !review) throw new Error("No active organization");
      return acceptFn({
        data: {
          organizationId: orgId,
          instanceId: review.instanceId,
          completionId: review.completionId,
          confirmedExpiresDate: confirmedExpires.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Evidence accepted. Staff file and renewal task updated.");
      void qc.invalidateQueries({ queryKey: ["cert-review", orgId, completionId] });
      void qc.invalidateQueries({ queryKey: ["pending-cert-reviews", orgId] });
      void qc.invalidateQueries({ queryKey: ["company-obligations", orgId] });
      void qc.invalidateQueries({ queryKey: ["staff-obligation-files"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const correct = useMutation({
    mutationFn: () => {
      if (!orgId || !review) throw new Error("No active organization");
      return correctFn({
        data: {
          organizationId: orgId,
          instanceId: review.instanceId,
          completionId: review.completionId,
          note: correctionNote.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Correction requested.");
      void qc.invalidateQueries({ queryKey: ["cert-review", orgId, completionId] });
      void qc.invalidateQueries({ queryKey: ["pending-cert-reviews", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orgId) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Select an organization to review this certificate.
      </div>
    );
  }
  if (q.isLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading certificate…</p>;
  }
  if (!review) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        This upload is not on the review queue.
      </div>
    );
  }

  const isImage = !!review.uploadFilename && /\.(png|jpe?g|gif|webp|bmp)$/i.test(review.uploadFilename);

  return (
    <section data-testid="cert-review" className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Review certificate
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{review.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {review.staffName} · {review.extractedCredential ?? "Certificate"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Certificate preview</p>
          {previewUrl && isImage ? (
            <img
              alt={review.uploadFilename ?? "Certificate"}
              src={previewUrl}
              className="max-h-[28rem] w-full rounded-md object-contain bg-muted"
            />
          ) : previewUrl ? (
            <iframe
              title={review.uploadFilename ?? "Certificate"}
              src={previewUrl}
              className="h-[28rem] w-full rounded-md border"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No file preview available.</p>
          )}
        </div>

        <aside className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Extracted details</p>
            <span
              data-testid="cert-review-status"
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900"
            >
              {certReviewStatusLabel(status)}
            </span>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="font-medium">{review.extractedName ?? "Not detected"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Credential</dt>
              <dd className="font-medium">{review.extractedCredential ?? "Not detected"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Completion</dt>
              <dd className="font-medium">{review.extractedCompletedOn ?? "Not detected"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expiration</dt>
              <dd className="font-medium">{review.extractedExpiresOn ?? "Not detected"}</dd>
            </div>
          </dl>
          {block ? (
            <p
              data-testid="cert-review-expiration-warn"
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              {block}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{CERT_REVIEW_AI_NOTE}</p>
          {review.nectarValidationReasons.length > 0 ? (
            <p className="text-xs text-muted-foreground">{review.nectarValidationReasons.join("; ")}</p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="confirmed-expires">Confirm expiration</Label>
            <Input
              id="confirmed-expires"
              type="date"
              value={confirmedExpires}
              onChange={(e) => setConfirmedExpires(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correction-note">Request correction note</Label>
            <Textarea
              id="correction-note"
              value={correctionNote}
              onChange={(e) => setCorrectionNote(e.target.value)}
              placeholder="What the staff member should fix"
              rows={3}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={correct.isPending || status === "accepted"}
              onClick={() => correct.mutate()}
            >
              Request correction
            </Button>
            <Button
              type="button"
              disabled={!canAccept || accept.isPending || status === "accepted"}
              onClick={() => accept.mutate()}
            >
              Accept evidence
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Acceptance updates the staff file and the renewal task.
          </p>
          <Link
            to="/dashboard/compliance"
            search={{ tab: "staff" }}
            className="text-xs font-medium underline-offset-2 hover:underline"
          >
            Back to Staff file
          </Link>
        </aside>
      </div>
    </section>
  );
}
