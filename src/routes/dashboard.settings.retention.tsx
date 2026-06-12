import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getRetentionSettings,
  updateRetentionSettings,
  sweepArchiveEligible,
  purgeAgedReferrals,
} from "@/lib/retention.functions";

export const Route = createFileRoute("/dashboard/settings/retention")({
  component: RetentionSettingsPage,
});

function RetentionSettingsPage() {
  const { data: org } = useCurrentOrg();
  const getFn = useServerFn(getRetentionSettings);
  const saveFn = useServerFn(updateRetentionSettings);
  const sweepFn = useServerFn(sweepArchiveEligible);
  const purgeFn = useServerFn(purgeAgedReferrals);

  const [archiveDays, setArchiveDays] = useState(90);
  const [graceDays, setGraceDays] = useState(30);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEdit =
    org?.role === "admin" || org?.role === "manager" || org?.role === "super_admin";

  useEffect(() => {
    if (!org) return;
    (async () => {
      try {
        const row = await getFn({ data: { organization_id: org.organization_id } });
        setArchiveDays(row.archive_days_after_due ?? 90);
        setGraceDays(row.purge_grace_days ?? 30);
        setAutoEnabled(!!row.auto_archive_enabled);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load settings");
      } finally {
        setLoaded(true);
      }
    })();
  }, [org, getFn]);

  const save = async () => {
    if (!org) return;
    if (archiveDays < 30) {
      toast.error("Archive window must be at least 30 days");
      return;
    }
    setBusy(true);
    try {
      await saveFn({
        data: {
          organization_id: org.organization_id,
          archive_days_after_due: archiveDays,
          purge_grace_days: graceDays,
          auto_archive_enabled: autoEnabled,
        },
      });
      toast.success("Retention settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const runSweep = async () => {
    if (!org) return;
    setBusy(true);
    try {
      const r = await sweepFn({ data: { organization_id: org.organization_id } });
      toast.success(`Archived ${r.archived} referral(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sweep failed");
    } finally {
      setBusy(false);
    }
  };

  const runPurge = async () => {
    if (!org) return;
    if (!confirm("Permanently purge referrals past the grace period? A tombstone (id, archive reason, outcome) is retained.")) return;
    setBusy(true);
    try {
      const r = await purgeFn({ data: { organization_id: org.organization_id } });
      toast.success(`Purged ${r.purged} referral(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Purge failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <Link to="/dashboard/settings" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-1 h-4 w-4" /> Settings
      </Link>

      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Archive className="h-5 w-5" /> Referral retention
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Archive is soft and recoverable. Purge is the only hard-delete, and only
          after the grace period elapses. A minimal tombstone (id, archive reason,
          decision outcome) is kept for audit even after purge.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Auto-archive enabled</Label>
            <p className="text-xs text-muted-foreground">When off, archive is manual-only.</p>
          </div>
          <Switch checked={autoEnabled} onCheckedChange={setAutoEnabled} disabled={!canEdit} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="archive-days">Archive days after due date (min 30)</Label>
          <Input
            id="archive-days"
            type="number"
            min={30}
            value={archiveDays}
            onChange={(e) => setArchiveDays(Number(e.target.value || 0))}
            disabled={!canEdit}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="grace-days">Purge grace days (after archive)</Label>
          <Input
            id="grace-days"
            type="number"
            min={0}
            value={graceDays}
            onChange={(e) => setGraceDays(Number(e.target.value || 0))}
            disabled={!canEdit}
          />
        </div>

        <Button onClick={save} disabled={!canEdit || !loaded || busy}>
          Save settings
        </Button>
      </div>

      {canEdit && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold">Run now</h2>
          <p className="text-xs text-muted-foreground">
            Manual sweep/purge. Auto-archive also runs on this rail when a
            scheduled sweep is configured.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={runSweep} disabled={busy}>
              <Archive className="mr-2 h-4 w-4" /> Archive eligible now
            </Button>
            <Button variant="destructive" onClick={runPurge} disabled={busy}>
              <Trash2 className="mr-2 h-4 w-4" /> Purge aged
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
