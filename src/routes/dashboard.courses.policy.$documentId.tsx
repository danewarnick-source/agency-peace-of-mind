import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/courses/policy/$documentId")({
  component: PolicySignPage,
});

const ESIGN_CONSENT_STATEMENT =
  "By typing my name below and clicking Sign, I am creating an electronic signature that has the same legal effect as a handwritten signature, in accordance with the ESIGN Act and Utah's Uniform Electronic Transactions Act (UETA).";

async function sha256Hex(input: string): Promise<string> {
  try {
    const buf = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

async function fetchClientIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const r = await fetch("https://api.ipify.org?format=json", { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { ip?: string };
    return j.ip ?? null;
  } catch {
    return null;
  }
}

export function PolicySignPage() {
  const { documentId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signature, setSignature] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [readToBottom, setReadToBottom] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { data: doc, isLoading } = useQuery({
    queryKey: ["policy-doc", documentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nectar_documents")
        .select("id, organization_id, title, raw_text, version, requires_acknowledgment")
        .eq("id", documentId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const attestationStatement = useMemo(
    () =>
      doc
        ? `I have read and understand "${doc.title}" and agree to follow it as a condition of my employment.`
        : "",
    [doc],
  );

  const persistSignature = async () => {
    if (!user || !doc) throw new Error("Missing data");
    const trimmed = signature.trim();
    if (trimmed.length < 2) throw new Error("Type your full legal name to sign.");
    if (!esignConsent) throw new Error("Electronic signature consent is required.");
    if (!readToBottom) throw new Error("Scroll to the end of the policy before signing.");

    const ip = await fetchClientIp();
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
    const timeZone = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
    const signedAt = new Date().toISOString();

    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    const signerFullName = prof?.full_name || trimmed;
    const signerEmail = prof?.email || user.email || null;

    const recordToHash = JSON.stringify({
      user_id: user.id,
      document_id: doc.id,
      document_version: doc.version,
      signer_full_name: signerFullName,
      signer_email: signerEmail,
      typed_signature: trimmed,
      attestation_statement: attestationStatement,
      consent_statement: ESIGN_CONSENT_STATEMENT,
      signed_at: signedAt,
      ip_address: ip,
      user_agent: userAgent,
      time_zone: timeZone,
    });
    const contentHash = await sha256Hex(recordToHash);

    const { error } = await supabase.from("policy_signatures").insert({
      organization_id: doc.organization_id,
      document_id: doc.id,
      document_version: doc.version,
      user_id: user.id,
      signer_full_name: signerFullName,
      signer_email: signerEmail,
      typed_signature: trimmed,
      attestation_statement: attestationStatement,
      consent_statement: ESIGN_CONSENT_STATEMENT,
      consent_accepted: true,
      content_hash: contentHash,
      ip_address: ip,
      user_agent: userAgent,
      time_zone: timeZone,
      signed_at: signedAt,
    });
    if (error) throw error;

    qc.invalidateQueries({ queryKey: ["my-pending-policies"] });
    qc.invalidateQueries({ queryKey: ["policy-signature-status", doc.id] });
  };

  const signMutation = useMutation({
    mutationFn: persistSignature,
    onSuccess: () => {
      toast.success("Policy signed — record saved.");
      navigate({ to: "/dashboard/courses" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setReadToBottom(true);
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading policy…</p>;
  if (!doc)
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Policy not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/dashboard/courses"><ArrowLeft className="mr-1 h-4 w-4" /> Back to My Trainings</Link>
        </Button>
      </div>
    );

  return (
    <div className="-mx-4 -my-5 flex h-full min-h-[calc(100dvh-9rem)] flex-col bg-background md:min-h-[600px]">
      <header className="border-b border-border bg-card px-4 py-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2 shrink-0">
          <Link to="/dashboard/courses"><ArrowLeft className="mr-1 h-4 w-4" /> My Trainings</Link>
        </Button>
        <h1 className="mt-1 text-base font-semibold leading-snug tracking-tight">{doc.title}</h1>
        <p className="text-xs text-muted-foreground">Version {doc.version} · Scroll to the end, then sign below.</p>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap bg-card p-4 text-sm leading-relaxed"
      >
        {doc.raw_text || "No text content available for this policy."}
        <div className="h-1" />
      </div>

      <footer className="border-t border-border bg-card px-4 py-3 space-y-3">
        {!readToBottom && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">
            Scroll to the end of the policy above to enable signing.
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">Attestation:</span> {attestationStatement}
        </p>
        <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] leading-relaxed dark:bg-amber-950/30 dark:border-amber-800">
          <Checkbox checked={esignConsent} onCheckedChange={(v) => setEsignConsent(v === true)} className="mt-0.5" />
          <span>
            <span className="block font-semibold text-amber-900 dark:text-amber-100">
              Electronic signature consent (ESIGN / Utah UETA)
            </span>
            {ESIGN_CONSENT_STATEMENT}
          </span>
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="sig" className="sr-only">Typed name signature</Label>
            <Input
              id="sig"
              placeholder="Type your full legal name to sign"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              disabled={!readToBottom}
            />
          </div>
          <Button
            onClick={() => signMutation.mutate()}
            disabled={signMutation.isPending || !readToBottom || signature.trim().length < 2 || !esignConsent}
            className="bg-[image:var(--gradient-brand)] text-primary-foreground"
          >
            <CheckCircle2 className="mr-1 h-4 w-4" />
            {signMutation.isPending ? "Saving…" : "Sign & acknowledge"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
