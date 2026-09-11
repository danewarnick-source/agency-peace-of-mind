import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PERMISSION_LABEL, type Permission } from "@/lib/rbac";
import { profilePermissionGroups } from "@/lib/profile-permission-groups";

const GROUPS = profilePermissionGroups();

export function StaffProfilePermissions({
  editing,
  draft,
  roleGranted,
  highlightPermission,
  onToggle,
}: {
  editing: boolean;
  draft: Record<string, boolean>;
  roleGranted: ReadonlyMap<string, boolean>;
  highlightPermission?: Permission;
  onToggle: (perm: Permission, granted: boolean) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    people_files: true,
    schedule_money: true,
    staff_phone: true,
  });

  return (
    <div className="space-y-3">
      {GROUPS.map((group) => {
        const isOpen = open[group.key] ?? true;
        return (
          <Collapsible
            key={group.key}
            open={isOpen}
            onOpenChange={(v) => setOpen((s) => ({ ...s, [group.key]: v }))}
            className="rounded-xl border border-border/70 bg-card"
          >
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                {group.label}
                <span className="text-xs font-normal text-muted-foreground">({group.permissions.length})</span>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-1 border-t border-border/60 px-3 py-2">
                {group.permissions.map((perm) => {
                  const granted = !!draft[perm];
                  const roleOn = !!roleGranted.get(perm);
                  const overridden = granted !== roleOn;
                  const highlight = highlightPermission === perm;
                  return (
                    <div
                      key={perm}
                      id={highlight ? "staff-perm-highlight" : undefined}
                      className={`flex items-start justify-between gap-3 rounded-lg px-2 py-2 ${
                        highlight ? "bg-[var(--hive-gold)]/10 ring-1 ring-[var(--hive-gold)]/40" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{PERMISSION_LABEL[perm]}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Role default: {roleOn ? "On" : "Off"}</span>
                          {overridden && <Badge variant="outline">This person</Badge>}
                        </div>
                      </div>
                      {editing ? (
                        <Switch
                          checked={granted}
                          onCheckedChange={(v) => onToggle(perm, v)}
                          aria-label={PERMISSION_LABEL[perm]}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">{granted ? "On" : "Off"}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
