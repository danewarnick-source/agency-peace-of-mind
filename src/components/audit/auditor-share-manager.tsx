import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  createAuditorShare,
  revokeAuditorShare,
  extendAuditorShare,
  listSharesForPacket,
} from "@/lib/auditor-shares.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Share2,
  ShieldAlert,
  Clock,
  Eye,
  XCircle,
  CheckCircle2,
  Loader2,
  Calendar,
} from "lucide-react";

type Props = {
  packetId: string;
  packetName: string;
  organizationId: string;
};

const STATUS_CLS: Record<string, string> = {
  active: "bg-[color:var(--amber-100)] text-[color:var(--navy-900)] border-0",
  scheduled: "bg-[color:var(--surface-2)] text-foreground border border-[color:var(--border-light)]",
  expired: "bg-muted text-muted-foreground border-0",
  revoked: "bg-destructive/10 text-destructive border border-destructive/30",
};

function nowLocal(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function AuditorShareManager({ packetId, packetName, organizationId }: Props) {
  const qc = useQueryClient();
  const listShares = useServerFn(listSharesForPacket);
  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState<null | {
    emails: string[];
    starts_at: string;
    ends_at: string;
    message: string;
  }>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["auditor-shares", packetId],
    queryFn: () => listShares({ data: { packet_id: packetId } }),
  });

  const create = useServerFn(createAuditorShare);
  const revoke = useServerFn(revokeAuditorShare);
  const extend = useServerFn(extendAuditorShare);

  const createMut = useMutation({
    mutationFn: (input: {
      recipient_emails: string[];
      starts_at: string;
      ends_at: string;
      message: string;
    }) =>
      create({
        data: {
          organization_id: organizationId,
          packet_id: packetId,
          recipient_emails: input.recipient_emails,
          starts_at: new Date(input.starts_at).toISOString(),
          ends_at: new Date(input.ends_at).toISOString(),
          message: input.message || null,
          share_all_items: true,
        },
      }),
    onSuccess: () => {
      toast.success("Auditor access granted");
      qc.invalidateQueries({ queryKey: ["auditor-shares", packetId] });
      setConfirming(null);
      setCreating(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't create share"),
  });

  const revokeMut = useMutation({
    mutationFn: (share_id: string) => revoke({ data: { share_id } }),
    onSuccess: () => {
      toast.success("Access revoked");
      qc.invalidateQueries({ queryKey: ["auditor-shares", packetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't revoke"),
  });

  const extendMut = useMutation({
    mutationFn: ({ share_id, ends_at }: { share_id: string; ends_at: string }) =>
      extend({ data: { share_id, ends_at: new Date(ends_at).toISOString() } }),
    onSuccess: () => {
      toast.success("Window updated");
      qc.invalidateQueries({ queryKey: ["auditor-shares", packetId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Couldn't update"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Share2 className="h-4 w-4 text-[color:var(--amber-600)]" /> Auditor access
          </h3>
          <p className="text-xs text-muted-foreground">
            Share this audit folder with a state auditor by email and access window. Replaces the old Google Drive folder share — you control exactly what is visible and when.
          </p>
        </div>
        <Button variant="cta" size="sm" onClick={() => setCreating(true)}>
          <Share2 className="h-4 w-4" /> Share with auditor
        </Button>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading shares…
        </div>
      )}

      <div className="space-y-2">
        {(data?.shares ?? []).length === 0 && !isLoading && (
          <div className="rounded-md border border-dashed border-[color:var(--border-light)] bg-white/60 px-3 py-4 text-xs text-muted-foreground">
            No auditor shares yet for this folder.
          </div>
        )}
        {(data?.shares ?? []).map((s: any) => (
          <div
            key={s.id}
            className="rounded-md border border-[color:var(--border-light)] bg-white/70 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.recipient_email}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(s.starts_at), "MMM d, h:mma")} →{" "}
                  {format(new Date(s.ends_at), "MMM d, yyyy h:mma")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={STATUS_CLS[s.live_status] ?? STATUS_CLS.scheduled}>
                  {s.live_status}
                </Badge>
                <Badge className="bg-[color:var(--surface-2)] text-foreground border-0">
                  <Eye className="h-3 w-3" /> {s.view_count} view{s.view_count === 1 ? "" : "s"}
                </Badge>
              </div>
            </div>
            {s.live_status !== "revoked" && (
              <div className="flex items-center gap-2 flex-wrap">
                <ExtendInline
                  currentEnd={s.ends_at}
                  onExtend={(ends_at) => extendMut.mutate({ share_id: s.id, ends_at })}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(`Revoke access for ${s.recipient_email}?`))
                      revokeMut.mutate(s.id);
                  }}
                >
                  <XCircle className="h-3.5 w-3.5" /> Revoke
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {creating && (
        <NewShareDialog
          packetName={packetName}
          onCancel={() => setCreating(false)}
          onPreview={(payload) => setConfirming(payload)}
        />
      )}

      {confirming && (
        <Dialog open onOpenChange={(o) => !o && setConfirming(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-[color:var(--amber-600)]" /> Confirm auditor access
              </DialogTitle>
              <DialogDescription>
                Review carefully before access goes live. Auditors verify their own email login — HIVE never creates accounts on their behalf.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <Row label="Audit folder" value={packetName} />
              <Row label="Recipients" value={confirming.emails.join(", ")} />
              <Row
                label="Access window"
                value={`${format(new Date(confirming.starts_at), "MMM d, yyyy h:mma")} → ${format(new Date(confirming.ends_at), "MMM d, yyyy h:mma")}`}
              />
              <Row label="Files shared" value="All items and attached records-desk files in this folder" />
              <div className="rounded-md border border-[color:var(--amber-300)] bg-[color:var(--amber-50)] text-xs px-3 py-2 text-foreground">
                Privacy reminder: sharing exposes protected client and staff records. Treat this with the same care as your current Drive-based audit workflow.
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
              <Button
                variant="cta"
                disabled={createMut.isPending}
                onClick={() =>
                  createMut.mutate({
                    recipient_emails: confirming.emails,
                    starts_at: confirming.starts_at,
                    ends_at: confirming.ends_at,
                    message: confirming.message,
                  })
                }
              >
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Grant access
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground pt-0.5">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function NewShareDialog({
  packetName,
  onCancel,
  onPreview,
}: {
  packetName: string;
  onCancel: () => void;
  onPreview: (p: { emails: string[]; starts_at: string; ends_at: string; message: string }) => void;
}) {
  const [emailsRaw, setEmailsRaw] = useState("");
  const [starts, setStarts] = useState(nowLocal(0));
  const [ends, setEnds] = useState(nowLocal(60 * 24 * 14));
  const [message, setMessage] = useState("");

  const submit = () => {
    const emails = emailsRaw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length === 0) {
      toast.error("Add at least one valid auditor email.");
      return;
    }
    if (new Date(ends) <= new Date(starts)) {
      toast.error("Access window end must be after start.");
      return;
    }
    onPreview({ emails, starts_at: starts, ends_at: ends, message });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share audit folder with auditor</DialogTitle>
          <DialogDescription>
            {packetName} · sharing replaces the Google Drive folder you'd normally email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Auditor email(s)</Label>
            <Textarea
              rows={2}
              value={emailsRaw}
              onChange={(e) => setEmailsRaw(e.target.value)}
              placeholder="auditor@dspd.utah.gov"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Separate multiple emails with commas. Each auditor signs in with the email you enter — they verify themselves.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access starts</Label>
              <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Access ends</Label>
              <Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Note to auditor (optional)</Label>
            <Textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Files for FY26 audit — please reach out with questions."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="cta" onClick={submit}>Review and grant</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtendInline({
  currentEnd,
  onExtend,
}: {
  currentEnd: string;
  onExtend: (ends_at: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => {
    const d = new Date(currentEnd);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Clock className="h-3.5 w-3.5" /> Extend / shorten
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="datetime-local"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-8 w-[200px] text-xs"
      />
      <Button size="sm" variant="cta" onClick={() => { onExtend(value); setOpen(false); }}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
