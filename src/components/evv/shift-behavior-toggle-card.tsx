import { useShiftBehaviorSetting, useSetShiftBehaviorSetting } from "@/hooks/use-shift-behavior-setting";
import { ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ShiftBehaviorToggleCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading } = useShiftBehaviorSetting();
  const mut = useSetShiftBehaviorSetting();
  const enabled = data?.enabled ?? true;

  async function toggle(next: boolean) {
    try {
      await mut.mutateAsync(next);
      toast.success(`Post-shift behavior questions ${next ? "enabled" : "disabled"}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">🧭 Post-shift Behavior Observations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              When ON, every EVV clock-out (all service codes) includes a brief, objective-language
              behavior observation block — feeds the monthly behavior summary. Default: ON.
            </p>
          </div>
        </div>
        {isAdmin ? (
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3 self-start rounded-md border border-border bg-background px-3 py-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary"
              checked={enabled}
              disabled={isLoading || mut.isPending}
              onChange={(e) => toggle(e.target.checked)}
            />
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? "Enabled" : "Disabled"}
          </label>
        ) : (
          <span className="self-start rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {enabled ? "Enabled" : "Disabled"} — admins manage this setting.
          </span>
        )}
      </div>
    </div>
  );
}
