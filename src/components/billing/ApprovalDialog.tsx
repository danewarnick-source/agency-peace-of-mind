// =============================================================
// Billing-code approval dialog.
// - Provider (no request yet): shows justification form + submit.
// - Anyone with an existing request: shows the threaded
//   conversation between the provider and HIVE Admin, with a
//   reply composer. A HIVE Admin viewer sees Approve / Deny
//   buttons wired to postApprovalMessage(action=...).
// This component is used both from the Smart Import review
// (per external billing row) and from the provider Inbox and
// the HIVE Admin queue for standalone thread viewing.
// =============================================================

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldAlert, Check, X, MessageSquare, PenLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

import {
  openApprovalRequest,
  postApprovalMessage,
  getApprovalThread,
  withdrawApprovalRequest,
  markApprovalThreadRead,
  type ApprovalMessageRow,
  type ApprovalRequestRow,
  type SenderRole,
} from "@/lib/billing-approvals.functions";

export interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  // If provided the dialog opens directly to the thread. Otherwise
  // it starts on the "new request" form.
  requestId?: string | null;
  // Context used when creating a brand-new request.
  code?: string;
  providerNameOnPcsp?: string | null;
  importJobId?: string | null;
  subjectId?: string | null;
  extractedFieldId?: string | null;
  onCreated?: (requestId: string) => void;
}

function statusBadge(status: ApprovalRequestRow["status"]) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="border-amber-500/60 text-amber-700 dark:text-amber-300">Pending HIVE review</Badge>;
    case "approved":
      return <Badge variant="outline" className="border-emerald-500/60 text-emerald-700 dark:text-emerald-300"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "denied":
      return <Badge variant="outline" className="border-destructive/60 text-destructive"><ShieldAlert className="mr-1 h-3 w-3" />Denied</Badge>;
    case "withdrawn":
      return <Badge variant="outline" className="text-muted-foreground">Withdrawn</Badge>;
  }
}

function fmt(ts: string) {
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return ts; }
}

export function ApprovalDialog(props: ApprovalDialogProps) {
  const { open, onOpenChange, organizationId, requestId, code, providerNameOnPcsp } = props;
  const [activeRequestId, setActiveRequestId] = useState<string | null>(requestId ?? null);
  useEffect(() => { setActiveRequestId(requestId ?? null); }, [requestId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        {activeRequestId ? (
          <ThreadView
            requestId={activeRequestId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <NewRequestForm
            organizationId={organizationId}
            code={code ?? ""}
            providerNameOnPcsp={providerNameOnPcsp ?? null}
            importJobId={props.importJobId ?? null}
            subjectId={props.subjectId ?? null}
            extractedFieldId={props.extractedFieldId ?? null}
            onCreated={(id) => {
              setActiveRequestId(id);
              props.onCreated?.(id);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewRequestForm({
  organizationId, code, providerNameOnPcsp, importJobId, subjectId, extractedFieldId, onCreated, onCancel,
}: {
  organizationId: string;
  code: string;
  providerNameOnPcsp: string | null;
  importJobId: string | null;
  subjectId: string | null;
  extractedFieldId: string | null;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const [justification, setJustification] = useState("");
  const openFn = useServerFn(openApprovalRequest);
  const m = useMutation({
    mutationFn: () =>
      openFn({
        data: {
          organizationId,
          code,
          providerNameOnPcsp,
          justification,
          importJobId,
          subjectId,
          extractedFieldId,
        },
      }),
    onSuccess: (res) => {
      toast.success("Request sent to HIVE Admin");
      onCreated(res.requestId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remaining = 20 - justification.trim().length;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Request HIVE Admin approval to bill {code}</DialogTitle>
        <DialogDescription>
          Explain why your organization needs to bill this code even though the PCSP lists another
          provider ({providerNameOnPcsp || "unknown"}). HIVE Admin will review and reply here — you
          can keep the conversation going back and forth in your Inbox until it is resolved.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
          <div><span className="text-muted-foreground">Code:</span> <span className="font-mono font-medium">{code}</span></div>
          <div><span className="text-muted-foreground">Provider on PCSP:</span> {providerNameOnPcsp || <span className="italic text-muted-foreground">unspecified</span>}</div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Justification for HIVE Admin</label>
          <Textarea
            rows={7}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={`Examples:
• We have a signed subcontract with the listed provider for this authorization period.
• The PCSP is out of date — the client transferred to us on <date> and a corrected PCSP is being issued.
• We have a HIVE-approved cross-agency arrangement for continuity of care.`}
          />
          <div className={`mt-1 text-[10px] ${remaining > 0 ? "text-muted-foreground" : "text-emerald-600"}`}>
            {remaining > 0 ? `Add at least ${remaining} more character${remaining === 1 ? "" : "s"}.` : "Ready to submit."}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={remaining > 0 || m.isPending}>
          {m.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          Send to HIVE Admin
        </Button>
      </DialogFooter>
    </>
  );
}

function ThreadView({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const getThread = useServerFn(getApprovalThread);
  const post = useServerFn(postApprovalMessage);
  const markRead = useServerFn(markApprovalThreadRead);
  const withdraw = useServerFn(withdrawApprovalRequest);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["approval-thread", requestId],
    queryFn: () => getThread({ data: { requestId } }),
    refetchInterval: 15000,
  });

  useEffect(() => {
    // Mark thread read when opened / refreshed.
    if (q.data) {
      markRead({ data: { requestId } }).catch(() => {});
      qc.invalidateQueries({ queryKey: ["approval-unread"] });
    }
  }, [q.data, requestId, markRead, qc]);

  const [reply, setReply] = useState("");
  const [signMode, setSignMode] = useState<null | "approve" | "deny">(null);
  const [sigName, setSigName] = useState("");
  const [sigAttested, setSigAttested] = useState(false);

  const postM = useMutation({
    mutationFn: (vars: { action: "approve" | "deny" | null; signatureName?: string; signatureAttested?: boolean }) =>
      post({
        data: {
          requestId,
          body: reply || (vars.action === "approve" ? "Approved." : vars.action === "deny" ? "Denied." : ""),
          action: vars.action,
          signatureName: vars.signatureName,
          signatureAttested: vars.signatureAttested,
        },
      }),
    onSuccess: (_res, vars) => {
      setReply("");
      setSignMode(null);
      setSigName("");
      setSigAttested(false);
      qc.invalidateQueries({ queryKey: ["approval-thread", requestId] });
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: ["approval-lookup"] });
      qc.invalidateQueries({ queryKey: ["hive-approvals"] });
      toast.success(vars.action ? `Ticket resolved and signed.` : "Message sent");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const withdrawM = useMutation({
    mutationFn: () => withdraw({ data: { requestId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["approval-thread", requestId] });
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      qc.invalidateQueries({ queryKey: ["approval-lookup"] });
      toast.success("Request withdrawn");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const request = q.data?.request;
  const viewer: SenderRole | undefined = q.data?.viewer_side;
  const messages = q.data?.messages ?? [];
  const isPending = request?.status === "pending";
  const isHiveViewer = viewer === "hive_admin";

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Billing approval ticket — {request?.code ?? "…"}
        </DialogTitle>
        <DialogDescription>
          {request ? (
            <span>
              {request.organization_name} · Provider on PCSP: {request.provider_name_on_pcsp || "unspecified"} · Opened {fmt(request.created_at)} by {request.requesting_user_name}
            </span>
          ) : "Loading…"}
        </DialogDescription>
      </DialogHeader>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {request && statusBadge(request.status)}
        {request?.resolved_at && (
          <span className="text-xs text-muted-foreground">
            {request.status === "approved" ? "Approved" : request.status === "denied" ? "Denied" : "Resolved"} {fmt(request.resolved_at)}
            {request.resolved_by_name ? ` by ${request.resolved_by_name}` : ""}
          </span>
        )}
        {request?.resolved_signature_name && (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <PenLine className="h-3 w-3" /> Signed: {request.resolved_signature_name}
            {request.resolved_signature_at ? ` · ${fmt(request.resolved_signature_at)}` : ""}
          </span>
        )}
      </div>

      <div className="max-h-[45vh] overflow-y-auto rounded-md border border-border bg-muted/20 p-2 text-sm">
        {q.isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">No messages yet.</div>
        ) : (
          <ol className="space-y-2">
            {messages.map((m) => <MessageBubble key={m.id} m={m} viewer={viewer!} />)}
          </ol>
        )}
      </div>

      {isPending && signMode === null && (
        <div className="mt-3 space-y-2">
          <Textarea
            rows={3}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder={isHiveViewer
              ? "Reply to the provider, or click Approve / Deny to sign and resolve the ticket."
              : "Reply to HIVE Admin…"}
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isHiveViewer && viewer === "provider" && (
              <Button variant="ghost" size="sm" onClick={() => withdrawM.mutate()} disabled={withdrawM.isPending}>
                Withdraw request
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => postM.mutate({ action: null })}
              disabled={postM.isPending || reply.trim().length === 0}
            >
              {postM.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Send reply
            </Button>
            {isHiveViewer && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/50 text-destructive"
                  onClick={() => setSignMode("deny")}
                  disabled={postM.isPending}
                >
                  <X className="mr-1 h-3 w-3" /> Deny…
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => setSignMode("approve")}
                  disabled={postM.isPending}
                >
                  <Check className="mr-1 h-3 w-3" /> Approve…
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {isPending && signMode !== null && isHiveViewer && (
        <div className="mt-3 space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <PenLine className="h-4 w-4" />
            Sign to {signMode === "approve" ? "approve" : "deny"} this ticket
          </div>
          <p className="text-xs text-muted-foreground">
            Your signature resolves the ticket and is recorded in the audit trail. The reply above becomes the resolution note.
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-medium">Type your full name to sign</label>
            <Input
              value={sigName}
              onChange={(e) => setSigName(e.target.value)}
              placeholder="e.g. Jane Doe"
              autoFocus
            />
          </div>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              checked={sigAttested}
              onCheckedChange={(v) => setSigAttested(v === true)}
              className="mt-0.5"
            />
            <span>
              I attest that this {signMode === "approve" ? "approval" : "denial"} is final, made in my official capacity as HIVE Admin, and recorded in the audit trail.
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setSignMode(null); setSigName(""); setSigAttested(false); }}
              disabled={postM.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={signMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90"}
              onClick={() => postM.mutate({ action: signMode, signatureName: sigName.trim(), signatureAttested: sigAttested })}
              disabled={postM.isPending || sigName.trim().length < 2 || !sigAttested}
            >
              {postM.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {signMode === "approve" ? <><Check className="mr-1 h-3 w-3" /> Sign &amp; approve</> : <><X className="mr-1 h-3 w-3" /> Sign &amp; deny</>}
            </Button>
          </div>
        </div>
      )}

      <DialogFooter className="mt-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </DialogFooter>
    </>
  );
}


function MessageBubble({ m, viewer }: { m: ApprovalMessageRow; viewer: SenderRole }) {
  const mine = m.sender_role === viewer;
  const align = mine ? "items-end" : "items-start";
  const bubble = mine
    ? "bg-primary/10 border-primary/30"
    : m.sender_role === "hive_admin"
      ? "bg-amber-50 border-amber-300/50 dark:bg-amber-950/30"
      : "bg-card border-border";
  const roleLabel = m.sender_role === "hive_admin" ? "HIVE Admin" : "Provider";
  return (
    <li className={`flex flex-col ${align}`}>
      <div className={`max-w-[85%] rounded-lg border p-2.5 ${bubble}`}>
        <div className="mb-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="font-semibold">{m.sender_name || roleLabel}</span>
          <span>·</span>
          <span>{roleLabel}</span>
          <span>·</span>
          <span>{fmt(m.created_at)}</span>
          {m.action === "approve" && (
            <Badge variant="outline" className="ml-1 border-emerald-500/60 text-emerald-700">Approved</Badge>
          )}
          {m.action === "deny" && (
            <Badge variant="outline" className="ml-1 border-destructive/60 text-destructive">Denied</Badge>
          )}
        </div>
        <div className="whitespace-pre-wrap text-sm">{m.body}</div>
      </div>
    </li>
  );
}

// Convenience presentational helper for lists.
export function useLastActivityLabel(row: ApprovalRequestRow): string {
  return useMemo(() => fmt(row.last_activity_at), [row.last_activity_at]);
}
