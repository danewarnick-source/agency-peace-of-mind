// Groups tab of Settings → Team Access. Admin-facing CRUD for staff_groups
// (named subsets of staff used to target Company Obligations), built on the
// server functions in @/lib/staff-groups.functions.
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Search,
  UserPlus,
  Users2,
  X,
} from "lucide-react";
import {
  addGroupMember,
  ALL_STAFF_GROUP_NAME,
  createStaffGroup,
  deleteStaffGroup,
  getStaffGroupWithMembers,
  listStaffGroups,
  removeGroupMember,
  syncGroupFromTeam,
  updateStaffGroup,
  type StaffGroupRow,
} from "@/lib/staff-groups.functions";

const COLOR_SWATCHES = [
  { label: "Blue", hex: "#3B82F6" },
  { label: "Green", hex: "#10B981" },
  { label: "Purple", hex: "#8B5CF6" },
  { label: "Amber", hex: "#F59E0B" },
  { label: "Red", hex: "#EF4444" },
  { label: "Pink", hex: "#EC4899" },
  { label: "Teal", hex: "#14B8A6" },
  { label: "Gray", hex: "#6B7280" },
];

type GroupWithCount = StaffGroupRow & { member_count: number };

interface GroupFormValue {
  name: string;
  description: string;
  color: string;
}

const EMPTY_FORM: GroupFormValue = { name: "", description: "", color: COLOR_SWATCHES[0].hex };

function GroupForm({
  value,
  onChange,
  onCancel,
  onSubmit,
  submitLabel,
  isSubmitting,
}: {
  value: GroupFormValue;
  onChange: (v: GroupFormValue) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  isSubmitting: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="group-name">Group name</Label>
        <Input
          id="group-name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. HHS night staff"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="group-description">Description (optional)</Label>
        <Input
          id="group-description"
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          placeholder="What this group is for"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {COLOR_SWATCHES.map((s) => (
            <button
              key={s.hex}
              type="button"
              title={s.label}
              onClick={() => onChange({ ...value, color: s.hex })}
              className="h-6 w-6 rounded-full ring-offset-2 ring-offset-background transition"
              style={{
                backgroundColor: s.hex,
                boxShadow: value.color === s.hex ? `0 0 0 2px ${s.hex}` : undefined,
                outline: value.color === s.hex ? "2px solid var(--foreground)" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" onClick={onSubmit} disabled={!value.name.trim() || isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function AddStaffCombobox({
  orgId,
  excludeIds,
  onSelect,
}: {
  orgId: string;
  excludeIds: Set<string>;
  onSelect: (staffId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: directory = [] } = useQuery({
    queryKey: ["org-member-directory-active", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("org_member_directory")
        .select("id, full_name, position")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; full_name: string | null; position: string | null }>;
    },
  });

  const options = useMemo(
    () => directory.filter((d) => !excludeIds.has(d.id)),
    [directory, excludeIds],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add staff
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Search staff…" />
          <CommandList>
            <CommandEmpty>No matching active staff.</CommandEmpty>
            <CommandGroup>
              {options.map((d) => (
                <CommandItem
                  key={d.id}
                  value={d.full_name ?? d.id}
                  onSelect={() => {
                    onSelect(d.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{d.full_name ?? "Unnamed"}</span>
                  {d.position && (
                    <span className="ml-2 text-xs text-muted-foreground">{d.position}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SyncFromTeamMenu({
  orgId,
  onSync,
  isSyncing,
}: {
  orgId: string;
  onSync: (teamId: string, teamName: string) => void;
  isSyncing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: teams = [] } = useQuery({
    queryKey: ["teams-for-sync", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, team_name")
        .eq("organization_id", orgId)
        .order("team_name", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Array<{ id: string; team_name: string | null }>;
    },
  });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={isSyncing}>
          <Users2 className="mr-1.5 h-3.5 w-3.5" /> Sync from team
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {teams.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No teams found</div>
        )}
        {teams.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => onSync(t.id, t.team_name ?? "Team")}>
            {t.team_name ?? "Untitled team"}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupDetail({ orgId, groupId, isAllStaff }: { orgId: string; groupId: string; isAllStaff: boolean }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getStaffGroupWithMembers);
  const addFn = useServerFn(addGroupMember);
  const removeFn = useServerFn(removeGroupMember);
  const syncFn = useServerFn(syncGroupFromTeam);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["staff-group-detail", orgId, groupId],
    queryFn: () => getFn({ data: { organizationId: orgId, groupId } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["staff-group-detail", orgId, groupId] });
    qc.invalidateQueries({ queryKey: ["staff-groups", orgId] });
  };

  const addMember = useMutation({
    mutationFn: (staffId: string) => addFn({ data: { organizationId: orgId, groupId, staffId } }),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (staffId: string) => removeFn({ data: { organizationId: orgId, groupId, staffId } }),
    onSuccess: invalidateAll,
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: (teamId: string) => syncFn({ data: { organizationId: orgId, groupId, teamId } }),
    onSuccess: (res, teamId, ctx) => {
      invalidateAll();
      return res;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const members = data?.members ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.staff_name.toLowerCase().includes(q));
  }, [members, search]);

  const existingIds = useMemo(() => new Set(members.map((m) => m.staff_id)), [members]);

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading members…</div>;
  }

  return (
    <div className="space-y-3 border-t border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter members…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        {!isAllStaff && (
          <>
            <AddStaffCombobox
              orgId={orgId}
              excludeIds={existingIds}
              onSelect={(staffId) => addMember.mutate(staffId)}
            />
            <SyncFromTeamMenu
              orgId={orgId}
              isSyncing={sync.isPending}
              onSync={(teamId, teamName) => {
                sync.mutate(teamId, {
                  onSuccess: (res: { added: number }) => {
                    toast.success(`Added ${res.added} member${res.added === 1 ? "" : "s"} from ${teamName}.`);
                  },
                });
              }}
            />
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">
          {members.length === 0 ? "No members yet." : "No members match your search."}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-card">
          {filtered.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{m.staff_name}</div>
                {m.staff_position && (
                  <div className="truncate text-xs text-muted-foreground">{m.staff_position}</div>
                )}
              </div>
              {!isAllStaff && (
                <button
                  type="button"
                  onClick={() => removeMember.mutate(m.staff_id)}
                  disabled={removeMember.isPending}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remove ${m.staff_name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GroupRow({ orgId, group }: { orgId: string; group: GroupWithCount }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateStaffGroup);
  const deleteFn = useServerFn(deleteStaffGroup);

  const isAllStaff = group.name === ALL_STAFF_GROUP_NAME;

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editValue, setEditValue] = useState<GroupFormValue>({
    name: group.name,
    description: group.description ?? "",
    color: group.color ?? COLOR_SWATCHES[0].hex,
  });

  const update = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          organizationId: orgId,
          groupId: group.id,
          name: editValue.name.trim(),
          description: editValue.description.trim() || null,
          color: editValue.color,
        },
      }),
    onSuccess: () => {
      toast.success("Group updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["staff-groups", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { organizationId: orgId, groupId: group.id } }),
    onSuccess: () => {
      toast.success("Group deleted");
      setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ["staff-groups", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      {editing ? (
        <div className="p-3">
          <GroupForm
            value={editValue}
            onChange={setEditValue}
            onCancel={() => setEditing(false)}
            onSubmit={() => update.mutate()}
            submitLabel="Save"
            isSubmitting={update.isPending}
          />
        </div>
      ) : (
        <div
          className="flex cursor-pointer items-center gap-3 p-3"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: group.color ?? "#6B7280" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{group.name}</span>
              <Badge variant="secondary" className="text-[11px]">
                ({group.member_count} member{group.member_count === 1 ? "" : "s"})
              </Badge>
              {isAllStaff && (
                <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                  Auto-managed — all staff are members
                </Badge>
              )}
            </div>
            {group.description && (
              <p className="truncate text-xs text-muted-foreground">{group.description}</p>
            )}
          </div>
          {!isAllStaff && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {expanded && !editing && <GroupDetail orgId={orgId} groupId={group.id} isAllStaff={isAllStaff} />}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{group.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the group from all obligations it's assigned to. Past completion
              records are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function StaffGroupsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStaffGroups);
  const createFn = useServerFn(createStaffGroup);

  const { data: groups = [], isLoading } = useQuery<GroupWithCount[]>({
    queryKey: ["staff-groups", orgId],
    enabled: !!orgId,
    queryFn: () => listFn({ data: { organizationId: orgId } }),
  });

  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState<GroupFormValue>(EMPTY_FORM);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: orgId,
          name: createValue.name.trim(),
          description: createValue.description.trim() || null,
          color: createValue.color,
        },
      }),
    onSuccess: () => {
      toast.success("Group created");
      setCreating(false);
      setCreateValue(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["staff-groups", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Staff Groups</h3>
          <p className="text-xs text-muted-foreground">
            Named subsets of staff used to target company obligations.
          </p>
        </div>
        {!creating && (
          <Button type="button" size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New group
          </Button>
        )}
      </div>

      {creating && (
        <GroupForm
          value={createValue}
          onChange={setCreateValue}
          onCancel={() => {
            setCreating(false);
            setCreateValue(EMPTY_FORM);
          }}
          onSubmit={() => create.mutate()}
          submitLabel="Create"
          isSubmitting={create.isPending}
        />
      )}

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading groups…</div>
      ) : groups.length === 0 && !creating ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No groups yet. Create one to start assigning company obligations.
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <GroupRow key={g.id} orgId={orgId} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
