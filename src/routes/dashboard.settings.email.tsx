import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  const [fromAddress, setFromAddress] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [verified, setVerified] = useState(false);
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
        const row = await getFn({ data: { organization_id: org.organization_id } });
        if (row) {
          setFromName(row.from_name ?? "");
          setFromAddress(row.from_address ?? "");
          setReplyTo(row.reply_to ?? "");
          setVerified(!!row.verified);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoaded(true);
      }
    })();
  }, [org, getFn]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          organization_id: org.organization_id,
          from_name: fromName.trim(),
          from_address: fromAddress.trim(),
          reply_to: replyTo.trim() || null,
          verified,
        },
      });
      toast.success("Email settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
      <Link to="/dashboard/settings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>

      <form onSubmit={save} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Organization email sender</h1>
            <p className="text-sm text-muted-foreground">
              Every email HIVE sends (referral follow-ups, notifications) uses this sender.
              Verify a sending domain in Resend (DNS records), then mark verified below.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="from_name">From name</Label>
            <Input id="from_name" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="True North Supports" disabled={!loaded} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="from_address">From address</Label>
            <Input id="from_address" type="email" value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="no-reply@tnsutah.com" disabled={!loaded} required />
            <p className="text-xs text-muted-foreground">Must live on a domain you've verified in Resend.</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reply_to">Reply-to (optional)</Label>
            <Input id="reply_to" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="admin@tnsutah.com" disabled={!loaded} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-semibold">Sender verified in Resend</div>
                <div className="text-xs text-muted-foreground">
                  Turn this on AFTER your DNS records are confirmed in the Resend dashboard.
                  Sends are refused until this is on.
                </div>
              </div>
            </div>
            <Switch checked={verified} onCheckedChange={setVerified} disabled={!loaded} />
          </div>
          <Button type="submit" disabled={!loaded || busy}>{busy ? "Saving…" : "Save settings"}</Button>
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
            <Input id="test_to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourdomain.com" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => sendTest(false)} disabled={sending}>{sending ? "Sending…" : "Send test"}</Button>
            <Button variant="outline" onClick={() => sendTest(true)} disabled={sending}>Force failure</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
