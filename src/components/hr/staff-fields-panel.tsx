/**
 * StaffFieldsPanel — the only place staff intake fields are configured.
 * Reads/writes organizations.feature_config["staff_intake_fields"] directly
 * (no server fn; same pattern as dashboard.settings.tsx org saves).
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Plus, X, Trash2 } from "lucide-react";

export type CustomFieldType = "text" | "date" | "yesno" | "number" | "dropdown";

export interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  at_hire: boolean;
}

export interface ToggleFieldConfig {
  enabled: boolean;
  options?: string[];
}

export interface StaffIntakeFieldsConfig {
  staff_type: ToggleFieldConfig;
  department: ToggleFieldConfig;
  employee_id: ToggleFieldConfig;
  worker_type: ToggleFieldConfig;
  custom_fields: CustomFieldDef[];
}

const DEFAULT_STAFF_TYPE_OPTIONS = [
  "Direct Support Professional",
  "Host Home Provider",
  "Executive Director",
  "Operations Director",
  "Executive Assistant",
];

const DEFAULT_DEPARTMENT_OPTIONS = [
  "Host Home",
  "Day Support",
  "Administration",
  "Clinical",
  "Transportation",
];

export const WORKER_TYPE_OPTIONS = ["W2 Employee", "1099 Contractor", "Other"];

const ALWAYS_REQUIRED = ["First name", "Last name", "Email address", "Phone number", "Hire date", "Role"];

function defaultConfig(): StaffIntakeFieldsConfig {
  return {
    staff_type: { enabled: true, options: [...DEFAULT_STAFF_TYPE_OPTIONS] },
    department: { enabled: false, options: [...DEFAULT_DEPARTMENT_OPTIONS] },
    employee_id: { enabled: false },
    worker_type: { enabled: false },
    custom_fields: [],
  };
}

export function normalizeConfig(raw: unknown): StaffIntakeFieldsConfig {
  const base = defaultConfig();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<StaffIntakeFieldsConfig>;
  return {
    staff_type: {
      enabled: r.staff_type?.enabled ?? base.staff_type.enabled,
      options: r.staff_type?.options?.length ? r.staff_type.options : base.staff_type.options,
    },
    department: {
      enabled: r.department?.enabled ?? base.department.enabled,
      options: r.department?.options?.length ? r.department.options : base.department.options,
    },
    employee_id: { enabled: r.employee_id?.enabled ?? base.employee_id.enabled },
    worker_type: { enabled: r.worker_type?.enabled ?? base.worker_type.enabled },
    custom_fields: Array.isArray(r.custom_fields) ? r.custom_fields : [],
  };
}

export const FIELD_TYPE_LABEL: Record<CustomFieldType, string> = {
  text: "Text",
  date: "Date",
  yesno: "Yes/No",
  number: "Number",
  dropdown: "Dropdown",
};

export function StaffFieldsPanel({
  open,
  onOpenChange,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}) {
  const [config, setConfig] = useState<StaffIntakeFieldsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void supabase
      .from("organizations")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("feature_config" as any)
      .eq("id", organizationId)
      .maybeSingle()
      .then(({ data }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fc = (data as any)?.feature_config ?? null;
        setConfig(normalizeConfig(fc?.staff_intake_fields));
        setLoading(false);
      });
  }, [open, organizationId]);

  const persist = (next: StaffIntakeFieldsConfig) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("feature_config" as any)
        .eq("id", organizationId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = ((data as any)?.feature_config ?? {}) as Record<string, unknown>;
      const merged = { ...existing, staff_intake_fields: next };
      const { error } = await supabase
        .from("organizations")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ feature_config: merged } as any)
        .eq("id", organizationId);
      if (!error) {
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 2000);
      }
    }, 500);
  };

  const update = (updater: (prev: StaffIntakeFieldsConfig) => StaffIntakeFieldsConfig) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      persist(next);
      return next;
    });
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle>Staff fields</SheetTitle>
            {saved && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
          <SheetDescription>
            Configure which fields appear when adding a new staff member
          </SheetDescription>
        </SheetHeader>

        {loading || !config ? (
          <div className="mt-6 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="mt-6 space-y-8">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cannot be turned off
              </p>
              <div className="flex flex-wrap gap-2">
                {ALWAYS_REQUIRED.map((f) => (
                  <Badge key={f} variant="secondary">{f}</Badge>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Standard fields
              </p>

              <ToggleRow
                label="Staff type"
                description="Multi-select · drives which SOW training requirements apply"
                recommended
                enabled={config.staff_type.enabled}
                onToggle={(v) => update((p) => ({ ...p, staff_type: { ...p.staff_type, enabled: v } }))}
              >
                <OptionsEditor
                  options={config.staff_type.options ?? []}
                  onChange={(opts) => update((p) => ({ ...p, staff_type: { ...p.staff_type, options: opts } }))}
                />
              </ToggleRow>

              <ToggleRow
                label="Department"
                description="Dropdown with options you define · for grouping and filtering staff"
                enabled={config.department.enabled}
                onToggle={(v) => update((p) => ({ ...p, department: { ...p.department, enabled: v } }))}
              >
                <OptionsEditor
                  options={config.department.options ?? []}
                  onChange={(opts) => update((p) => ({ ...p, department: { ...p.department, options: opts } }))}
                />
              </ToggleRow>

              <ToggleRow
                label="Employee ID"
                description="Free text · internal identifier from your payroll or HR system · optional at hire time"
                enabled={config.employee_id.enabled}
                onToggle={(v) => update((p) => ({ ...p, employee_id: { enabled: v } }))}
              />

              <ToggleRow
                label="Worker type"
                description="W2 / 1099 / Contractor classification"
                enabled={config.worker_type.enabled}
                onToggle={(v) => update((p) => ({ ...p, worker_type: { enabled: v } }))}
              >
                <div className="flex flex-wrap gap-2">
                  {WORKER_TYPE_OPTIONS.map((o) => (
                    <Badge key={o} variant="outline">{o}</Badge>
                  ))}
                </div>
              </ToggleRow>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Custom fields
                </p>
              </div>

              {config.custom_fields.length > 0 && (
                <ul className="space-y-2">
                  {config.custom_fields.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.name}</span>
                      <Badge variant="outline">{FIELD_TYPE_LABEL[f.type]}</Badge>
                      <Badge
                        variant="default"
                        className={
                          f.at_hire
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {f.at_hire ? "At hire" : "Profile only"}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() =>
                          update((p) => ({
                            ...p,
                            custom_fields: p.custom_fields.filter((cf) => cf.id !== f.id),
                          }))
                        }
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <AddCustomFieldForm
                onAdd={(field) =>
                  update((p) => ({ ...p, custom_fields: [...p.custom_fields, field] }))
                }
              />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ToggleRow({
  label, description, enabled, onToggle, recommended, children,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  recommended?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            {recommended && (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Recommended
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function OptionsEditor({
  options, onChange,
}: {
  options: string[];
  onChange: (opts: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const addOption = () => {
    const trimmed = input.trim();
    if (!trimmed || options.includes(trimmed)) return;
    onChange([...options, trimmed]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <span
            key={o}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs"
          >
            {o}
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${o}`}
              onClick={() => onChange(options.filter((x) => x !== o))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder="Add option…"
          className="h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" className="h-8" onClick={addOption}>
          Add
        </Button>
      </div>
    </div>
  );
}

function AddCustomFieldForm({ onAdd }: { onAdd: (field: CustomFieldDef) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [options, setOptions] = useState<string[]>([]);
  const [atHire, setAtHire] = useState(true);

  const reset = () => {
    setName("");
    setType("text");
    setOptions([]);
    setAtHire(true);
    setOpen(false);
  };

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Add field
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
      <div className="grid gap-2">
        <Label htmlFor="cf-name">Field name</Label>
        <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="grid gap-2">
        <Label>Field type</Label>
        <Select value={type} onValueChange={(v) => setType(v as CustomFieldType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Text</SelectItem>
            <SelectItem value="date">Date</SelectItem>
            <SelectItem value="yesno">Yes/No</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="dropdown">Dropdown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {type === "dropdown" && (
        <div className="grid gap-2">
          <Label>Options</Label>
          <OptionsEditor options={options} onChange={setOptions} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={atHire} onCheckedChange={(v) => setAtHire(v === true)} />
        Collect at hire time
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={reset}>Cancel</Button>
        <Button
          type="button"
          size="sm"
          disabled={!name.trim()}
          onClick={() => {
            onAdd({
              id: crypto.randomUUID(),
              name: name.trim(),
              type,
              options: type === "dropdown" ? options : [],
              at_hire: atHire,
            });
            reset();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
