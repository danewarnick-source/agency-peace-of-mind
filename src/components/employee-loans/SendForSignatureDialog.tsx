import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Copy, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendEmployeeLoanForSignature } from "@/lib/employee-loans.functions";

export function SendForSignatureDialog({
  open, onOpenChange, organizationId, loanId, defaultEmail, defaultName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  loanId: string;
  defaultEmail: string;
  defaultName: string;
}) {
  const send = useServerFn(sendEmployeeLoanForSignature);
  const qc = useQueryClient();
  const [email, setEmail] = useState(defaultEmail);
  const [name, setName] = useState(defaultName);
  const [result, setResult] = useState<{ sign_url: string; expires_at: string; email: { ok: boolean; error?: string } } | null>(null);
  const [copied, setCopied] = useState(false);

  const mut = useMutation({
    mutationFn: () =>
      send({
        data: {
          organization_id: organizationId,
          loan_id: loanId,
          signer_email: email,
          signer_name: name,
          base_url: typeof window !== "undefined" ? window.location.origin : "",
        },
      }),
    onSuccess: (r) => {
      setResult({ sign_url: r.sign_url, expires_at: r.expires_at, email: r.email });
      qc.invalidateQueries({ queryKey: ["employee-loan", organizationId, loanId] });
      qc.invalidateQueries({ queryKey: ["employee-loans", organizationId] });
      if (r.email.ok) toast.success("Signing link emailed");
      else toast.warning("Link created — email could not be sent automatically");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
  });

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.sign_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send agreement for e-signature</DialogTitle>
          <DialogDescription>
            The employee receives a secure link to review the full agreement and sign electronically.
            The signature is legally binding under the U.S. E-SIGN Act (name, IP, timestamp, and frozen
            agreement text are captured).
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3">
            <div>
              <Label>Signer name (employee)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Signer email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Uses your organization's configured email sender. If the sender is not verified yet,
                you'll get a link you can copy and share manually.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-md border p-3 text-sm ${result.email.ok ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-amber-300 bg-amber-50/50 dark:bg-amber-900/10"}`}>
              {result.email.ok
                ? `Email sent to ${email}. The link expires ${new Date(result.expires_at).toLocaleString()}.`
                : `Link created but email was not sent: ${result.email.error}. Copy the link below and share it manually.`}
            </div>
            <div>
              <Label>Signing link</Label>
              <div className="flex gap-2">
                <Input readOnly value={result.sign_url} />
                <Button variant="outline" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => mut.mutate()} disabled={!email || !name || mut.isPending}>
                <Mail className="mr-2 h-4 w-4" /> {mut.isPending ? "Sending…" : "Send for signature"}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
