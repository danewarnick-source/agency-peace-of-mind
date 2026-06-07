import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import type { FormSettings } from "@/lib/forms-utils";
import { useState } from "react";

const TABS = ["General", "Sharing", "Limitations", "Reminders"] as const;

export function SettingsModal({
  open, onOpenChange, value, onChange,
}: { open: boolean; onOpenChange: (b: boolean) => void; value: FormSettings; onChange: (v: FormSettings) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  const [draft, setDraft] = useState<FormSettings>(value);
  function patch(p: Partial<FormSettings>) { setDraft((d) => ({ ...d, ...p })); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
          <nav className="flex md:flex-col gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <Button key={t} size="sm" variant={tab === t ? "default" : "ghost"} className="justify-start" onClick={() => setTab(t)}>
                {t}
              </Button>
            ))}
          </nav>
          <div className="space-y-3">
            {tab === "General" && (
              <>
                <Row checked={!!draft.anonymous} onChange={(b) => patch({ anonymous: b })} label="Anonymous submissions" hint="Submissions are saved without staff identity." />
                <Row checked={!!draft.commenting} onChange={(b) => patch({ commenting: b })} label="Enable commenting on entries" />
                <Row checked={!!draft.allow_download} onChange={(b) => patch({ allow_download: b })} label="Let staff download their own entries" />
                <Row checked={!!draft.allow_edit} onChange={(b) => patch({ allow_edit: b })} label="Let staff edit submissions after sending" />
              </>
            )}
            {tab === "Sharing" && (
              <>
                <Row checked={!!draft.share_manager} onChange={(b) => patch({ share_manager: b })} label="Auto-share with the submitter's direct manager" />
                <div className="grid gap-1.5">
                  <Label className="text-xs">Extra emails (comma-separated)</Label>
                  <Input value={(draft.share_emails ?? []).join(", ")} onChange={(e) => patch({ share_emails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
                </div>
                <Row checked={!!draft.notify_push} onChange={(b) => patch({ notify_push: b })} label="Notify shared people in-app" />
                <Row checked={!!draft.notify_email} onChange={(b) => patch({ notify_email: b })} label="Notify shared people by email" />
              </>
            )}
            {tab === "Limitations" && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Submission cap per staff</Label>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.submission_limit ?? "unlimited"}
                  onChange={(e) => patch({ submission_limit: e.target.value as FormSettings["submission_limit"] })}>
                  <option value="unlimited">Unlimited</option>
                  <option value="1_per_day">1 per day</option>
                  <option value="1_per_week">1 per week</option>
                  <option value="1_per_month">1 per month</option>
                  <option value="1_total">1 total</option>
                </select>
              </div>
            )}
            {tab === "Reminders" && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Nudge assigned staff who haven't submitted</Label>
                <select className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.remind ?? "off"} onChange={(e) => patch({ remind: e.target.value as FormSettings["remind"] })}>
                  <option value="off">Off</option>
                  <option value="3_days_before">3 days before due</option>
                  <option value="weekly">Weekly</option>
                  <option value="daily">Daily</option>
                </select>
                <p className="text-xs text-muted-foreground">Reminders are computed when a staff member opens HIVE; no message is sent off-hours.</p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => { onChange(draft); onOpenChange(false); }}>Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ checked, onChange, label, hint }: { checked: boolean; onChange: (b: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm min-h-[44px] cursor-pointer">
      <Checkbox checked={checked} onCheckedChange={(c) => onChange(!!c)} className="mt-0.5" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}
