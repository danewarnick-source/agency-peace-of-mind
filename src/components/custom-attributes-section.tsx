import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCustomFields, setCustomFieldValue } from "@/lib/custom-fields.functions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

type Kind = "employee" | "client";

export function CustomAttributesSection({
  organizationId,
  entityKind,
  entityId,
}: {
  organizationId: string | undefined;
  entityKind: Kind;
  entityId: string | undefined;
}) {
  const fetchFn = useServerFn(getCustomFields);
  const saveFn = useServerFn(setCustomFieldValue);
  const qc = useQueryClient();
  const enabled = Boolean(organizationId && entityId);

  const { data: fields, isLoading } = useQuery({
    queryKey: ["custom-fields", entityKind, entityId, organizationId],
    queryFn: () => fetchFn({ data: { organizationId: organizationId!, entityKind, entityId: entityId! } }),
    enabled,
  });

  const mutation = useMutation({
    mutationFn: (vars: {
      definitionId: string;
      value_text?: string | null;
      value_number?: number | null;
      value_boolean?: boolean | null;
      value_date?: string | null;
    }) => saveFn({ data: { organizationId: organizationId!, entityKind, entityId: entityId!, ...vars } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-fields", entityKind, entityId] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!enabled) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        Agency Specific Custom Attributes
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </div>
      ) : !fields || fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No custom attributes yet. They'll appear here when you import a roster with extra columns.
        </p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {fields.map((f) => (
            <FieldRow key={f.id} field={f} onSave={(v) => mutation.mutate({ definitionId: f.id, ...v })} />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  onSave,
}: {
  field: {
    id: string;
    field_label: string;
    data_type: "text" | "number" | "boolean" | "date";
    value: {
      value_text?: string | null;
      value_number?: number | null;
      value_boolean?: boolean | null;
      value_date?: string | null;
    } | null;
  };
  onSave: (v: {
    value_text?: string | null;
    value_number?: number | null;
    value_boolean?: boolean | null;
    value_date?: string | null;
  }) => void;
}) {
  const initial =
    field.data_type === "number" ? (field.value?.value_number ?? "")
    : field.data_type === "boolean" ? Boolean(field.value?.value_boolean)
    : field.data_type === "date" ? (field.value?.value_date ?? "")
    : (field.value?.value_text ?? "");
  const [val, setVal] = useState<string | boolean | number>(initial as never);

  useEffect(() => { setVal(initial as never); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [field.id]);

  const commit = () => {
    if (field.data_type === "number") {
      const n = val === "" || val === null ? null : Number(val);
      onSave({ value_number: Number.isFinite(n as number) ? (n as number) : null });
    } else if (field.data_type === "boolean") {
      onSave({ value_boolean: Boolean(val) });
    } else if (field.data_type === "date") {
      onSave({ value_date: (val as string) || null });
    } else {
      onSave({ value_text: (val as string) || null });
    }
  };

  return (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{field.field_label}</Label>
      {field.data_type === "boolean" ? (
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={Boolean(val)}
            onCheckedChange={(v) => { setVal(v); onSave({ value_boolean: v }); }}
          />
          <span className="text-xs">{val ? "Yes" : "No"}</span>
        </div>
      ) : (
        <Input
          type={field.data_type === "number" ? "number" : field.data_type === "date" ? "date" : "text"}
          value={val as string | number}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          className="h-8 text-sm"
        />
      )}
    </div>
  );
}
