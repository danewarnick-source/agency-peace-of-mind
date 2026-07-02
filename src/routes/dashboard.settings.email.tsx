import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getOrgEmailSettings, updateOrgEmailSettings, sendEmail } from "@/lib/email.functions";

export const Route = createFileRoute("/dashboard/settings/email")({
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const { data: org } = useCurrentOrg();
  const getFn = useServerFn(getOrgEmailSettings);
  const saveFn = useServerFn(updateOrgEmailSettings);
  const sendFn = useServerFn(sendEmail);

  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [hiveFromAddress, setHiveFromAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);

  const canEdit =
    org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  useEffect(() => {
    if (!org) return;
    (async () => {
      try {
        const res = await getFn({ data: { organization_id: org.organization_id } });
        setHiveFromAddress(res.hive_managed_from_address);
        const row = res.settings;
        if (row) {
          setFromName(row.from_name ?? "");
          setReplyTo(row.reply_to ?? "");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoaded(true);
      }
    })();
  }, [org, getFn]);

  const previewDisplayName =
    fromName.trim() || org?.organization_name || "HIVE Notifications";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    if (!replyTo.trim()) {
      toast.error("Enter a reply-to address so recipients can reply to your organization.");
      return;
    }
    setBusy(true);
    try {
      await saveFn({
        data: {
          organization_id: org.organization_id,
          send_mode: "hive_managed",
          from_name: fromName.trim() || null,
          reply_to: replyTo.trim(),
        },
      });
      toast.success("Email settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (force: boolean) => {
    if (!org || !testTo.trim()) {
      toast.error("Enter a recipient address");
      return;
    }
    setSending(true);
    try {
      const res = await sendFn({
        data: {
          organization_id: org.organization_id,
          to: testTo.trim(),
          subject: force ? "HIVE — forced failure test" : "HIVE — Resend rail test",
          html: `<p>This is a HIVE rail test from <strong>${org.organization_name}</strong>.</p>`,
          forceFail: force,
        },
      });
      if (res.ok) toast.success(`Sent (${res.id ?? "no id"})`);
      else toast.error(res.error ?? "Send failed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  };

  if (!org) return null;
  if (!canEdit) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        You don't have access to email settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        to="/dashboard/settings"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>

      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <div className="font-semibold">HIVE-managed sending is on</div>
            <div className="text-muted-foreground">
              Emails send immediately from HIVE's shared sender — no DNS setup needed.
              Sending from your own domain is coming later.
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={save}
        className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Organization email sender</h1>
            <p className="text-sm text-muted-foreground">
              Every email HIVE sends for {org.organization_name} (loan signatures,
              notifications, referral follow-ups) uses these settings.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="reply_to">
              Reply-to address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="reply_to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="admin@yourdomain.com"
              disabled={!loaded}
              required
            />
            <p className="text-xs text-muted-foreground">
              When recipients hit "Reply", their email will go to this address.
              Use a mailbox someone actually reads.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="from_name">From display name (optional)</Label>
            <Input
              id="from_name"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder={org.organization_name}
              disabled={!loaded}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to your organization name.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Inbox preview
            </div>
            <div className="mt-1 font-mono text-sm">
              {previewDisplayName} &lt;{hiveFromAddress || "onboarding@resend.dev"}&gt;
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Reply-to: <span className="font-mono">{replyTo.trim() || "(none set)"}</span>
            </div>
          </div>

          <Button type="submit" disabled={!loaded || busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <h2 className="text-base font-semibold">Send a test</h2>
        <p className="text-sm text-muted-foreground">
          Confirms the full rail end-to-end. A forced failure returns an honest error (not logged as sent).
        </p>
        <div className="mt-4 grid gap-3 sm:flex sm:items-end">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="test_to">Recipient</Label>
            <Input
              id="test_to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@yourdomain.com"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => sendTest(false)} disabled={sending}>
              {sending ? "Sending…" : "Send test"}
            </Button>
            <Button variant="outline" onClick={() => sendTest(true)} disabled={sending}>
              Force failure
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
