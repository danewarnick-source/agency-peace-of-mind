import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SCOPE_NONE_VALUE, type EmployeeScopeDraft } from "@/lib/obligations/scope";

export type EmployeeScopeGroupOption = {
  id: string;
  name: string;
};

export function EmployeeScopeFields({
  groups,
  available,
  editing,
  draft,
  onChange,
}: {
  groups: EmployeeScopeGroupOption[];
  available: boolean;
  editing: boolean;
  draft: EmployeeScopeDraft;
  onChange: (next: EmployeeScopeDraft) => void;
}) {
  const scopeLabel =
    draft.scopeGroupId == null
      ? "Organization"
      : (groups.find((g) => g.id === draft.scopeGroupId)?.name ?? "Organization");
  const leadLabel =
    draft.leadGroupId == null
      ? "None"
      : (groups.find((g) => g.id === draft.leadGroupId)?.name ?? "None");

  if (!available) {
    return (
      <p className="text-sm text-muted-foreground">
        Scope columns are not live yet. Core Soft applies them after merge.
      </p>
    );
  }

  if (!editing) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Scope</p>
          <p className="text-sm">{scopeLabel}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Leads group</p>
          <p className="text-sm">{leadLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Scope</span>
        <Select
          value={draft.scopeGroupId ?? SCOPE_NONE_VALUE}
          onValueChange={(value) =>
            onChange({
              ...draft,
              scopeGroupId: value === SCOPE_NONE_VALUE ? null : value,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Organization" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SCOPE_NONE_VALUE}>Organization</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1.5 text-sm">
        <span className="text-xs font-medium text-muted-foreground">Leads group</span>
        <Select
          value={draft.leadGroupId ?? SCOPE_NONE_VALUE}
          onValueChange={(value) =>
            onChange({
              ...draft,
              leadGroupId: value === SCOPE_NONE_VALUE ? null : value,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="None" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SCOPE_NONE_VALUE}>None</SelectItem>
            {groups.map((g) => (
              <SelectItem key={`lead-${g.id}`} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
}
