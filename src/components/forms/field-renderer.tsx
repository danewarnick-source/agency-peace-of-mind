import { useState } from "react";
import type { FormField } from "@/lib/forms-utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Star, MapPin } from "lucide-react";
import { SignaturePad } from "./signature-pad";

export function FieldRenderer({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled?: boolean;
}) {
  const id = `fld_${field.id}`;
  if (field.type === "section") {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-base font-semibold">{field.label}</p>
        {field.instructions && <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{field.instructions}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {field.label}{field.required ? <span className="text-rose-500"> *</span> : null}
      </Label>
      {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
      <Inner field={field} id={id} value={value} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Inner({ field, id, value, onChange, disabled }: { field: FormField; id: string; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  switch (field.type) {
    case "short_text":
    case "email":
    case "phone":
      return (
        <Input
          id={id} type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          placeholder={field.placeholder} value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)} disabled={disabled} maxLength={500}
        />
      );
    case "paragraph":
      return <Textarea id={id} placeholder={field.placeholder} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} rows={4} maxLength={5000} />;
    case "date":
      return <Input id={id} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "time":
      return <Input id={id} type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
    case "number": {
      const cfg = field.config ?? {};
      if (cfg.display === "slider") {
        const v = typeof value === "number" ? value : (cfg.min ?? 0);
        return (
          <div className="space-y-1">
            <Slider value={[v]} min={cfg.min ?? 0} max={cfg.max ?? 100} step={cfg.step ?? 1}
              onValueChange={(arr) => onChange(arr[0])} disabled={disabled} />
            <p className="text-xs text-muted-foreground">Value: <span className="font-semibold">{v}</span></p>
          </div>
        );
      }
      return <Input id={id} type="number" min={cfg.min} max={cfg.max} step={cfg.step ?? 1}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} disabled={disabled} />;
    }
    case "dropdown":
      return (
        <select id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Select an option…</option>
          {(field.options ?? []).map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      );
    case "checkboxes": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-1.5">
          {(field.options ?? []).map((o, i) => {
            const checked = arr.includes(o);
            return (
              <label key={i} className="flex items-center gap-2 text-sm min-h-[44px]">
                <Checkbox checked={checked} disabled={disabled}
                  onCheckedChange={(c) => onChange(c ? [...arr, o] : arr.filter((x) => x !== o))} />
                <span>{o}</span>
              </label>
            );
          })}
        </div>
      );
    }
    case "yes_no":
      return (
        <div className="flex gap-2">
          {(["Yes", "No"] as const).map((opt) => (
            <Button key={opt} type="button" variant={value === opt ? "default" : "outline"} size="sm"
              onClick={() => onChange(opt)} disabled={disabled} className="min-h-[44px] flex-1 md:flex-none md:min-w-[80px]">
              {opt}
            </Button>
          ))}
        </div>
      );
    case "rating": {
      const scale = field.config?.scale ?? 5;
      const v = (value as number) ?? 0;
      return (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: scale }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)}
              className="min-h-[44px] min-w-[44px] grid place-items-center rounded-md hover:bg-muted">
              <Star className={`h-6 w-6 ${n <= v ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
      );
    }
    case "signature":
      return <SignaturePad value={(value as string) ?? null} onChange={onChange} disabled={disabled} />;
    case "photo":
    case "file":
      return (
        <Input id={id} type="file" accept={field.type === "photo" ? "image/*" : undefined}
          capture={field.type === "photo" ? "environment" : undefined}
          disabled={disabled}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) { onChange(null); return; }
            const reader = new FileReader();
            reader.onload = () => onChange({ name: f.name, type: f.type, size: f.size, dataUrl: reader.result as string });
            reader.readAsDataURL(f);
          }} />
      );
    case "location":
      return <LocationCapture value={value} onChange={onChange} disabled={disabled} />;
    default:
      return <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  }
}

function LocationCapture({ value, onChange, disabled }: { value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const v = value as { lat: number; lng: number; accuracy?: number; at?: string } | null;
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled || busy} className="min-h-[44px]"
        onClick={() => {
          if (!navigator.geolocation) return;
          setBusy(true);
          navigator.geolocation.getCurrentPosition(
            (pos) => { onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date().toISOString() }); setBusy(false); },
            () => setBusy(false),
            { enableHighAccuracy: true, timeout: 10000 },
          );
        }}>
        <MapPin className="mr-1.5 h-4 w-4" /> {v ? "Recapture location" : "Capture location"}
      </Button>
      {v && <p className="text-xs text-muted-foreground">{v.lat.toFixed(5)}, {v.lng.toFixed(5)} (±{Math.round(v.accuracy ?? 0)}m)</p>}
    </div>
  );
}
