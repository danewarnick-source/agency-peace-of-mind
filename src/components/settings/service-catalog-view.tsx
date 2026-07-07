import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentOrg } from "@/hooks/use-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Save } from "lucide-react";

type SchedulingBehavior =
  | "staffed_residential"
  | "host_family_residential"
  | "supported_living"
  | "day_employment"
  | "respite"
  | "in_home"
  | "behavior"
  | "billing_only";

type Unit = "day" | "quarter_hour" | "session" | "monthly" | "one_time";

type ServiceCode = {
  id: string;
  organization_id: string;
  code: string;
  name: string | null;
  category: string;
  scheduling_behavior: SchedulingBehavior;
  requires_schedule: boolean;
  requires_evv: boolean;
  is_living_arrangement: boolean;
  carve_out: boolean;
  unit: Unit;
  is_active: boolean;
};

const CATEGORIES = [
  "Behavior",
  "Day Supports",
  "In Home",
  "Residential",
  "Respite",
  "Supported Employment",
  "Supported Living",
  "Budget Assistance",
  "Transportation",
];

const SCHED_BEHAVIORS: SchedulingBehavior[] = [
  "staffed_residential",
  "host_family_residential",
  "supported_living",
  "day_employment",
  "respite",
  "in_home",
  "behavior",
  "billing_only",
];

const UNITS: Unit[] = ["day", "quarter_hour", "session", "monthly", "one_time"];

export function ServiceCatalogView() {
  const { data: org } = useCurrentOrg();
  const qc = useQueryClient();
  const orgId = org?.organization_id;

  const { data: codes = [] } = useQuery({
    enabled: !!orgId,
    queryKey: ["service-catalog", orgId],
    queryFn: async (): Promise<ServiceCode[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("service_codes" as any)
        .select("*")
        .eq("organization_id", orgId!)
        .order("code");
      if (error) throw error;
      return ((data ?? []) as unknown) as ServiceCode[];
    },
  });

  const sorted = useMemo(
    () => [...codes].sort((a, b) => a.code.localeCompare(b.code)),
    [codes],
  );

  const upsert = useMutation({
    mutationFn: async (row: Partial<ServiceCode> & { code: string }) => {
      if (!orgId) throw new Error("No org");
      const payload = {
        organization_id: orgId,
        code: row.code.toUpperCase().trim(),
        name: row.name ?? null,
        category: row.category ?? "Residential",
        scheduling_behavior: row.scheduling_behavior ?? "staffed_residential",
        requires_schedule: !!row.requires_schedule,
        requires_evv: !!row.requires_evv,
        is_living_arrangement: !!row.is_living_arrangement,
        carve_out: !!row.carve_out,
        unit: row.unit ?? "day",
        is_active: row.is_active ?? true,
      };
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("service_codes" as any)
        .upsert(payload, { onConflict: "organization_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["service-catalog", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("service_codes" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["service-catalog", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Scheduling and billing attributes for every service code your agency uses. The
        scheduler and billing engine read these attributes — change them here, and the
        rest of the app follows. Hour-based codes bill in quarter-hour units (4 per
        hour).
      </p>

      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm max-md:[&_th:first-child]:sticky max-md:[&_th:first-child]:left-0 max-md:[&_th:first-child]:z-10 max-md:[&_th:first-child]:bg-card max-md:[&_td:first-child]:sticky max-md:[&_td:first-child]:left-0 max-md:[&_td:first-child]:bg-card">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Code</th>
                <th className="p-2">Name</th>
                <th className="p-2">Category</th>
                <th className="p-2">Scheduling behavior</th>
                <th className="p-2 text-center">Schedule</th>
                <th className="p-2 text-center">EVV</th>
                <th className="p-2 text-center">Living</th>
                <th className="p-2 text-center">Carve out</th>
                <th className="p-2">Unit</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <EditableRow
                  key={row.id}
                  row={row}
                  onSave={(r) => upsert.mutate(r)}
                  onDelete={() => remove.mutate(row.id)}
                />
              ))}
              <NewRow onAdd={(r) => upsert.mutate(r)} />
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tip: <b>requires_evv</b> is the regulatory EVV mandate (geofenced electronic
          visit verification). It is separate from the shift clock-in/out that all
          scheduled coverage uses for coverage proof and payroll.
        </p>
      </div>
    </div>
  );
}

function EditableRow({
  row,
  onSave,
  onDelete,
}: {
  row: ServiceCode;
  onSave: (r: Partial<ServiceCode> & { code: string }) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ServiceCode>(row);
  const dirty =
    draft.name !== row.name ||
    draft.category !== row.category ||
    draft.scheduling_behavior !== row.scheduling_behavior ||
    draft.requires_schedule !== row.requires_schedule ||
    draft.requires_evv !== row.requires_evv ||
    draft.is_living_arrangement !== row.is_living_arrangement ||
    draft.carve_out !== row.carve_out ||
    draft.unit !== row.unit;

  return (
    <tr className="border-t border-border align-middle">
      <td className="p-2 font-mono font-semibold">
        <Badge variant="secondary">{row.code}</Badge>
      </td>
      <td className="p-2">
        <Input
          value={draft.name ?? ""}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="h-8 w-48"
        />
      </td>
      <td className="p-2">
        <select
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select
          value={draft.scheduling_behavior}
          onChange={(e) =>
            setDraft({ ...draft, scheduling_behavior: e.target.value as SchedulingBehavior })
          }
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {SCHED_BEHAVIORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <CheckCell
        checked={draft.requires_schedule}
        onChange={(v) => setDraft({ ...draft, requires_schedule: v })}
      />
      <CheckCell
        checked={draft.requires_evv}
        onChange={(v) => setDraft({ ...draft, requires_evv: v })}
      />
      <CheckCell
        checked={draft.is_living_arrangement}
        onChange={(v) => setDraft({ ...draft, is_living_arrangement: v })}
      />
      <CheckCell
        checked={draft.carve_out}
        onChange={(v) => setDraft({ ...draft, carve_out: v })}
      />
      <td className="p-2">
        <select
          value={draft.unit}
          onChange={(e) => setDraft({ ...draft, unit: e.target.value as Unit })}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2 whitespace-nowrap">
        <Button
          size="sm"
          variant={dirty ? "default" : "ghost"}
          disabled={!dirty}
          onClick={() => onSave(draft)}
        >
          <Save className="h-4 w-4" /> Save
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function CheckCell({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <td className="p-2 text-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer"
      />
    </td>
  );
}

function NewRow({
  onAdd,
}: {
  onAdd: (r: Partial<ServiceCode> & { code: string }) => void;
}) {
  const empty = {
    code: "",
    name: "",
    category: "Residential",
    scheduling_behavior: "staffed_residential" as SchedulingBehavior,
    requires_schedule: true,
    requires_evv: false,
    is_living_arrangement: false,
    carve_out: false,
    unit: "day" as Unit,
  };
  const [d, setD] = useState(empty);
  return (
    <tr className="border-t border-border bg-muted/30 align-middle">
      <td className="p-2">
        <Input
          placeholder="CODE"
          value={d.code}
          onChange={(e) => setD({ ...d, code: e.target.value.toUpperCase() })}
          className="h-8 w-24 uppercase font-mono"
        />
      </td>
      <td className="p-2">
        <Input
          placeholder="Name"
          value={d.name}
          onChange={(e) => setD({ ...d, name: e.target.value })}
          className="h-8 w-48"
        />
      </td>
      <td className="p-2">
        <select
          value={d.category}
          onChange={(e) => setD({ ...d, category: e.target.value })}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select
          value={d.scheduling_behavior}
          onChange={(e) =>
            setD({ ...d, scheduling_behavior: e.target.value as SchedulingBehavior })
          }
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {SCHED_BEHAVIORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <CheckCell
        checked={d.requires_schedule}
        onChange={(v) => setD({ ...d, requires_schedule: v })}
      />
      <CheckCell checked={d.requires_evv} onChange={(v) => setD({ ...d, requires_evv: v })} />
      <CheckCell
        checked={d.is_living_arrangement}
        onChange={(v) => setD({ ...d, is_living_arrangement: v })}
      />
      <CheckCell checked={d.carve_out} onChange={(v) => setD({ ...d, carve_out: v })} />
      <td className="p-2">
        <select
          value={d.unit}
          onChange={(e) => setD({ ...d, unit: e.target.value as Unit })}
          className="h-8 rounded-md border border-border bg-background px-2"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <Button
          size="sm"
          onClick={() => {
            if (!d.code.trim()) return toast.error("Code is required");
            onAdd(d);
            setD(empty);
          }}
        >
          <Plus className="h-4 w-4" /> Add
        </Button>
      </td>
    </tr>
  );
}
