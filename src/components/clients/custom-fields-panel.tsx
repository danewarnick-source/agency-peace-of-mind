/**
 * CustomFieldsForSection — admin panel rendered once at the bottom of
 * each of the six client-profile section tabs. Lets admins:
 *   1. Add new custom fields pinned to that section (label + data type;
 *      section is locked to the current tab — no way to create a new
 *      section).
 *   2. Edit each field's value inline (persists via the shared
 *      setCustomFieldValue server fn).
 *   3. Delete a field definition.
 *
 * Staff visibility is inherited entirely from the parent section's
 * toggle. There is no per-field visibility switch here on purpose.
 */
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useClientCareData } from "@/hooks/use-client-care-data";
import type { CustomFieldWithValue } from "@/lib/client-care-data.functions";
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  setCustomFieldValue,
} from "@/lib/custom-fields.functions";
import { SECTION_LABEL, type SectionName } from "@/lib/client-staff-visibility";

type DataType = "text" | "number" | "boolean" | "date";

export function CustomFieldsForSection({
  clientId,
  section,
}: {
  clientId: string;
  section: SectionName;
}) {
  const care = useClientCareData(clientId);
  const orgId = care.data?.identity.organization_id ?? null;
  const fields = useMemo(
    () => (care.data?.custom_fields ?? []).filter((f) => f.section === section),
    [care.data, section],
  );

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Custom fields</div>
          <div className="text-xs text-muted-foreground">
            Visible to staff whenever the {SECTION_LABEL[section]} section is on.
          </div>
        </div>
        {orgId && (
          <AddCustomFieldButton
            clientId={clientId}
            orgId={orgId}
            section={section}
          />
        )}
      </div>

      {fields.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No custom fields yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {fields.map((f) => (
            <CustomFieldRow
              key={f.id}
              clientId={clientId}
              orgId={orgId}
              field={f}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomFieldRow({
  clientId,
  orgId,
  field,
}: {
  clientId: string;
  orgId: string | null;
  field: CustomFieldWithValue;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(setCustomFieldValue);
  const deleteFn = useServerFn(deleteCustomFieldDefinition);

  const initial = coerceInitial(field);
  const [value, setValue] = useState<string | boolean | null>(initial);

  const saveMut = useMutation({
    mutationFn: (v: string | boolean | null) => {
      if (!orgId) throw new Error("Missing organization");
      const payload = {
        organizationId: orgId,
        definitionId: field.id,
        entityKind: "client" as const,
        entityId: clientId,
        value_text: null as string | null,
        value_number: null as number | null,
        value_boolean: null as boolean | null,
        value_date: null as string | null,
      };
      if (field.data_type === "text") payload.value_text = (v as string) || null;
      else if (field.data_type === "number")
        payload.value_number = v === "" || v === null ? null : Number(v);
      else if (field.data_type === "boolean")
        payload.value_boolean = typeof v === "boolean" ? v : false;
      else if (field.data_type === "date")
        payload.value_date = (v as string) || null;
      return saveFn({ data: payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-care-data", clientId] });
      toast.success("Saved");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  const delMut = useMutation({
    mutationFn: () => {
      if (!orgId) throw new Error("Missing organization");
      return deleteFn({
        data: { organizationId: orgId, definitionId: field.id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-care-data", clientId] });
      toast.success("Custom field deleted");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
      <Label className="min-w-[140px] text-sm font-medium">
        {field.field_label}
      </Label>

      <div className="flex-1 min-w-[180px]">
        {field.data_type === "boolean" ? (
          <Switch
            checked={value === true}
            onCheckedChange={(v) => setValue(v)}
          />
        ) : (
          <Input
            type={
              field.data_type === "number"
                ? "number"
                : field.data_type === "date"
                  ? "date"
                  : "text"
            }
            value={value === null || value === false || value === true ? "" : String(value)}
            onChange={(e) => setValue(e.target.value)}
            className="h-8"
          />
        )}
      </div>

      <Button
        type="button"
        size="sm"
        onClick={() => saveMut.mutate(value)}
        disabled={saveMut.isPending}
      >
        {saveMut.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          "Save"
        )}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${field.field_label}`}
        disabled={delMut.isPending}
        onClick={() => {
          if (confirm(`Delete the "${field.field_label}" custom field for every client?`)) {
            delMut.mutate();
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function coerceInitial(f: CustomFieldWithValue): string | boolean | null {
  const v = f.value;
  if (!v) return f.data_type === "boolean" ? false : "";
  switch (f.data_type) {
    case "text": return v.value_text ?? "";
    case "number": return v.value_number == null ? "" : String(v.value_number);
    case "boolean": return v.value_boolean ?? false;
    case "date": return v.value_date ?? "";
  }
}

function AddCustomFieldButton({
  clientId,
  orgId,
  section,
}: {
  clientId: string;
  orgId: string;
  section: SectionName;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createCustomFieldDefinition);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [dataType, setDataType] = useState<DataType>("text");

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          organizationId: orgId,
          entityKind: "client",
          section,
          field_label: label.trim(),
          data_type: dataType,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-care-data", clientId] });
      setLabel("");
      setDataType("text");
      setOpen(false);
      toast.success("Custom field added");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to add"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add custom field
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom field to {SECTION_LABEL[section]}</DialogTitle>
          <DialogDescription>
            The field belongs to {SECTION_LABEL[section]} and inherits that
            section's staff-visibility toggle. Section cannot be changed here.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Preferred pharmacy"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as DataType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!label.trim() || mut.isPending}
          >
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
