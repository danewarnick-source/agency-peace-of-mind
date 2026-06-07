import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCustomFields, setCustomFieldValue } from "@/lib/custom-fields.functions";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";

type Kind = "employee" | "client";

const LONG_VALUE_THRESHOLD = 140; // chars

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

  // Split fields into "short" (grid) and "long" (full-width) based on existing value length.
  const { shortFields, longFields } = useMemo(() => {
    const all = fields ?? [];
    const longs: typeof all = [];
    const shorts: typeof all = [];
    for (const f of all) {
      const text = f.value?.value_text ?? "";
      const isLongType = f.data_type === "text" && text.length > LONG_VALUE_THRESHOLD;
      if (isLongType) longs.push(f);
      else shorts.push(f);
    }
    return { shortFields: shorts, longFields: longs };
  }, [fields]);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading…
      </div>
    );
  }

  if (!fields || fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No custom attributes yet. They'll appear here when you import a roster with extra columns,
        run an AI PDF import, or add a field manually.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {shortFields.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shortFields.map((f) => (
            <FieldBlock
              key={f.id}
              field={f}
              variant="short"
              onSave={(v) => mutation.mutate({ definitionId: f.id, ...v })}
            />
          ))}
        </div>
      )}

      {longFields.length > 0 && (
        <div className="space-y-4">
          {longFields.map((f) => (
            <FieldBlock
              key={f.id}
              field={f}
              variant="long"
              onSave={(v) => mutation.mutate({ definitionId: f.id, ...v })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FromPcspBadge() {
  return (
    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary">
      from PCSP
    </span>
  );
}

function FieldBlock({
  field,
  variant,
  onSave,
}: {
  field: {
    id: string;
    field_label: string;
    data_type: "text" | "number" | "boolean" | "date";
    source?: "manual" | "pcsp";
    value: {
      value_text?: string | null;
      value_number?: number | null;
      value_boolean?: boolean | null;
      value_date?: string | null;
    } | null;
  };
  variant: "short" | "long";
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
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setVal(initial as never);
    setEditing(false);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [field.id]);

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
    setEditing(false);
  };

  const isLong = variant === "long";
  const textValue = typeof val === "string" ? val : "";
  const showTruncated = isLong && !expanded && textValue.length > 400;
  const displayText = showTruncated ? textValue.slice(0, 400) + "…" : textValue;

  return (
    <div
      className={`rounded-lg border border-border/60 bg-card p-3 ${isLong ? "p-4" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Label className="text-xs font-semibold text-[#0B1126]">{field.field_label}</Label>
        {field.source === "pcsp" && <FromPcspBadge />}
      </div>

      {field.data_type === "boolean" ? (
        <div className="flex items-center gap-2 pt-1">
          <Switch
            checked={Boolean(val)}
            onCheckedChange={(v) => { setVal(v); onSave({ value_boolean: v }); }}
          />
          <span className="text-sm">{val ? "Yes" : "No"}</span>
        </div>
      ) : isLong ? (
        editing ? (
          <div className="space-y-2">
            <Textarea
              value={textValue}
              onChange={(e) => setVal(e.target.value)}
              rows={Math.min(20, Math.max(6, Math.ceil(textValue.length / 80)))}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={commit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => { setVal(initial as never); setEditing(false); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground leading-relaxed">
              {displayText || <span className="text-muted-foreground italic">Not set</span>}
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              {textValue.length > 400 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="text-primary hover:underline"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
        )
      ) : field.data_type === "text" && textValue.length > 60 ? (
        // Medium-length text in the short grid → render a small textarea so it fully wraps,
        // never truncated to "…".
        <Textarea
          value={textValue}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          rows={3}
          className="text-sm"
        />
      ) : (
        <Input
          type={field.data_type === "number" ? "number" : field.data_type === "date" ? "date" : "text"}
          value={val as string | number}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          className="h-9 text-sm"
        />
      )}
    </div>
  );
}
