import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PartyPopper } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useCurrentOrg } from "@/hooks/use-org";
import {
  getCelebrationSettings,
  setCelebrationSettings,
  setUserCelebrationMute,
} from "@/lib/celebrations.functions";

export function CelebrationSettings({ isAdmin }: { isAdmin: boolean }) {
  const { data: org } = useCurrentOrg();
  const orgId = org?.organization_id;
  const fetchFn = useServerFn(getCelebrationSettings);
  const saveOrgFn = useServerFn(setCelebrationSettings);
  const saveMuteFn = useServerFn(setUserCelebrationMute);

  const { data, refetch, isLoading } = useQuery({
    enabled: !!orgId,
    queryKey: ["celebration-settings", orgId],
    queryFn: () => fetchFn({ data: { organizationId: orgId! } }),
  });

  const [enabled, setEnabled] = useState(true);
  const [t1, setT1] = useState(true);
  const [t2, setT2] = useState(true);
  const [t3, setT3] = useState(true);
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setEnabled(data.org.enabled);
    setT1(data.org.tier1Enabled);
    setT2(data.org.tier2Enabled);
    setT3(data.org.tier3Enabled);
    setMuted(data.userMuted);
  }, [data]);

  const saveOrg = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await saveOrgFn({ data: { organizationId: orgId, enabled, tier1Enabled: t1, tier2Enabled: t2, tier3Enabled: t3 } });
      toast.success("Celebration settings saved");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const saveMute = async (next: boolean) => {
    setMuted(next);
    try {
      await saveMuteFn({ data: { muted: next } });
      toast.success(next ? "Celebrations muted for you" : "Celebrations unmuted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
      setMuted(!next);
    }
  };

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-muted/40" />;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d112b] text-[#f4a93a]">
          <PartyPopper className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Celebrations</h2>
          <p className="text-sm text-muted-foreground">
            NECTAR marks milestones with quick toasts, banners, and the occasional confetti moment.
          </p>
        </div>
      </div>

      {isAdmin && (
        <div className="space-y-4 rounded-xl border border-border bg-background p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Organization defaults
          </p>
          <Row label="Celebrations enabled" hint="Master switch for the whole organization." checked={enabled} onChange={setEnabled} />
          <Row label="Tier 1 — quick toasts" hint="Small wins (first invite, training complete)." checked={t1} onChange={setT1} disabled={!enabled} />
          <Row label="Tier 2 — banners" hint="Notable milestones (5 staff onboarded, perfect EVV week)." checked={t2} onChange={setT2} disabled={!enabled} />
          <Row label="Tier 3 — confetti modal" hint="Big moments (first claim submitted, anniversaries)." checked={t3} onChange={setT3} disabled={!enabled} />
          <div className="pt-1">
            <Button onClick={saveOrg} disabled={busy} size="sm">Save organization defaults</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
        <div>
          <p className="text-sm font-medium">Mute celebrations for me</p>
          <p className="text-xs text-muted-foreground">Hides all tiers on your account, regardless of org settings.</p>
        </div>
        <Switch checked={muted} onCheckedChange={saveMute} />
      </div>
    </section>
  );
}

function Row({
  label, hint, checked, onChange, disabled,
}: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className={disabled ? "opacity-60" : ""}>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
