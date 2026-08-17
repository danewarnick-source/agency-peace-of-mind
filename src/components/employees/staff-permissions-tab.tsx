import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Star, Search, Plus, Trash2, ChevronsUpDown, AlertTriangle } from "lucide-react";
import {
  ALL_PERMISSIONS, PERMISSION_LABEL, PERMISSION_SECTIONS, PERMISSION_SECTION_MAP,
  ROLE_LABEL, type Permission, type Role,
} from "@/lib/rbac";
import { useEffectivePermissions } from "@/hooks/use-permissions";
import { setUserPermissionOverride, removeUserPermissionOverride } from "@/lib/permissions.functions";

type FilterMode = "all" | "granted" | "denied" | "overrides";

const EXPIRY_PRESETS: Array<{ label: string; days: number | null }> = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "6 months", days: 182 },
  { label: "1 year", days: 365 },
  { label: "No expiry", days: null },
];

export function StaffPermissionsTab({
  organizationId,
  staffId,
  initialOverridePermission,
}: {
  organizationId: string;
  staffId: string;
  initialOverridePermission?: Permission;
}) {
  const qc = useQueryClient();
  const { data: effective, isLoading } = useEffectivePermissions(staffId);
  const setOverrideFn = useServerFn(setUserPermissionOverride);
  const removeOverrideFn = useServerFn(removeUserPermissionOverride);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [drawerOpen, setDrawerOpen] = useState(!!initialOverridePermission);
  const [removeTarget, setRemoveTarget] = useState<Permission | null>(null);
  const [removing, setRemoving] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["effective-permissions", organizationId, staffId] });
  };

  const rows = useMemo(() => {
    if (!effective) return [];
    return ALL_PERMISSIONS.map((perm) => ({
      perm,
      label: PERMISSION_LABEL[perm],
      section: PERMISSION_SECTION_MAP[perm],
      entry: effective.resolved[perm],
    })).filter((r) => {
      if (search && !r.label.toLowerCase().includes(search.toLowerCase())) return false;
      if (filter === "granted" && !r.entry?.granted) return false;
      if (filter === "denied" && r.entry?.granted) return false;
      if (filter === "overrides" && r.entry?.source === "role") return false;
      return true;
    });
  }, [effective, search, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof rows> = {};
    rows.forEach((r) => {
      (groups[r.section] ??= []).push(r);
    });
    return groups;
  }, [rows]);

  const activeOverrides = useMemo(
    () => ALL_PERMISSIONS
      .map((perm) => ({ perm, entry: effective?.resolved[perm] }))
      .filter((r) => r.entry && r.entry.source !== "role"),
    [effective],
  );

  const doRemove = async (perm: Permission) => {
    setRemoving(true);
    try {
      await removeOverrideFn({
        data: { organizationId, targetUserId: staffId, permission: perm },
      });
      toast.success("Override removed");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove override");
    } finally {
      setRemoving(false);
      setRemoveTarget(null);
    }
  };

  if (isLoading || !effective) {
    return <div className="text-sm text-muted-foreground">Loading permissions…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search permissions…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="granted">Granted only</SelectItem>
              <SelectItem value="denied">Denied only</SelectItem>
              <SelectItem value="overrides">Individual overrides only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-4">
          {Object.entries(PERMISSION_SECTIONS).map(([sectionKey, sectionLabel]) => {
            const entries = grouped[sectionKey];
            if (!entries?.length) return null;
            return (
              <div key={sectionKey}>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {sectionLabel}
                </h4>
                <div className="space-y-1.5">
                  {entries.map(({ perm, label, entry }) => (
                    <div key={perm} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-2.5">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{label}</div>
                        {entry?.source !== "role" && entry?.overrideDetails && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            By {entry.overrideDetails.by} · {entry.overrideDetails.reason} ·{" "}
                            {entry.overrideDetails.expires_at
                              ? `Expires ${new Date(entry.overrideDetails.expires_at).toLocaleDateString()}`
                              : "No expiry"}
                          </div>
                        )}
                      </div>
                      <PermissionPill entry={entry} role={effective.role} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {!rows.length && (
            <div className="py-6 text-center text-sm text-muted-foreground">No permissions match your filters.</div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Individual overrides</h3>
          <Button size="sm" onClick={() => setDrawerOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add override
          </Button>
        </div>
        {!activeOverrides.length ? (
          <p className="text-sm text-muted-foreground">No individual overrides set for this person.</p>
        ) : (
          <div className="space-y-2">
            {activeOverrides.map(({ perm, entry }) => (
              <div key={perm} className="flex items-start justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{PERMISSION_LABEL[perm]}</span>
                    <Badge variant={entry!.granted ? "default" : "destructive"}>
                      {entry!.granted ? "Granted" : "Denied"}
                    </Badge>
                  </div>
                  {entry?.overrideDetails && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      By {entry.overrideDetails.by} · {entry.overrideDetails.reason} ·{" "}
                      {entry.overrideDetails.expires_at
                        ? `Expires ${new Date(entry.overrideDetails.expires_at).toLocaleDateString()}`
                        : "No expiry"}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setRemoveTarget(perm)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddOverrideDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        organizationId={organizationId}
        staffId={staffId}
        role={effective.role}
        resolved={effective.resolved}
        initialPermission={initialOverridePermission}
        setOverrideFn={setOverrideFn}
        onSaved={invalidate}
      />

      <AlertDialog open={!!removeTarget} onOpenChange={(v) => !v && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove override?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the individual override for{" "}
              {removeTarget ? PERMISSION_LABEL[removeTarget] : ""} and revert to the role default.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={removing} onClick={() => removeTarget && doRemove(removeTarget)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PermissionPill({
  entry,
  role,
}: {
  entry: { granted: boolean; source: "role" | "individual_grant" | "individual_deny" } | undefined;
  role: Role | null;
}) {
  if (!entry) return null;
  const roleLabel = role ? ROLE_LABEL[role] : "role";
  if (entry.source === "individual_grant") {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <Star className="h-3 w-3" /> Individually granted
      </Badge>
    );
  }
  if (entry.source === "individual_deny") {
    return (
      <Badge variant="destructive" className="gap-1">
        <Star className="h-3 w-3" /> Individually denied
      </Badge>
    );
  }
  if (entry.granted) {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Granted — from {roleLabel} role</Badge>;
  }
  return <Badge variant="secondary">Denied — from {roleLabel} role</Badge>;
}

function AddOverrideDrawer({
  open,
  onOpenChange,
  organizationId,
  staffId,
  role,
  resolved,
  initialPermission,
  setOverrideFn,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  organizationId: string;
  staffId: string;
  role: Role | null;
  resolved: Record<string, { granted: boolean; source: string }>;
  initialPermission?: Permission;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setOverrideFn: (args: { data: any }) => Promise<any>;
  onSaved: () => void;
}) {
  const [permission, setPermission] = useState<Permission | undefined>(initialPermission);
  const [comboOpen, setComboOpen] = useState(false);
  const [mode, setMode] = useState<"grant" | "deny">("grant");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPermission(undefined);
    setMode("grant");
    setReason("");
    setExpiresAt(null);
  };

  const roleAlreadyGrants = permission ? !!resolved[permission]?.granted && resolved[permission]?.source === "role" : false;

  const save = async () => {
    if (!permission || reason.trim().length < 10) return;
    setSaving(true);
    try {
      await setOverrideFn({
        data: {
          organizationId,
          targetUserId: staffId,
          permission,
          granted: mode === "grant",
          reason: reason.trim(),
          expiresAt,
        },
      });
      toast.success("Override saved");
      onSaved();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save override");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add individual override</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Permission</label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {permission ? PERMISSION_LABEL[permission] : "Select a permission…"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Search permissions…" />
                  <CommandList>
                    <CommandEmpty>No permission found.</CommandEmpty>
                    <CommandGroup>
                      {ALL_PERMISSIONS.map((p) => (
                        <CommandItem
                          key={p}
                          value={PERMISSION_LABEL[p]}
                          onSelect={() => { setPermission(p); setComboOpen(false); }}
                        >
                          {PERMISSION_LABEL[p]}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Grant or deny</label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "grant" | "deny")} className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
                <RadioGroupItem value="grant" className="mt-0.5" />
                Grant this permission — this person will have access regardless of their role.
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5 text-sm">
                <RadioGroupItem value="deny" className="mt-0.5" />
                Deny this permission — this person will not have access even if their role allows it.
              </label>
            </RadioGroup>
            {mode === "deny" && (
              <p className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Explicitly denying a permission overrides their role configuration. Use this
                carefully — it will block access even if you later update the role settings.
              </p>
            )}
            {mode === "grant" && roleAlreadyGrants && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                This permission is already granted by their role. An individual override is only
                needed if you want this person to keep access even if the role configuration changes.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Reason (required, min. 10 characters)</label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Why is this override needed?" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Expiry</label>
            <div className="flex flex-wrap gap-2">
              {EXPIRY_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={
                    (preset.days === null && expiresAt === null) ||
                    (preset.days !== null && expiresAt === addDaysIso(preset.days))
                      ? "default"
                      : "outline"
                  }
                  onClick={() => setExpiresAt(preset.days === null ? null : addDaysIso(preset.days))}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!permission || reason.trim().length < 10 || saving} onClick={save}>
              {saving ? "Saving…" : "Save override"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
