import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface SampleOption {
  id: string;
  label: string;
  sublabel?: string | null;
}

interface Props {
  label: string;
  placeholder: string;
  options: SampleOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Target sample size hint, e.g. "8 requested". */
  targetCount?: number | null;
  emptyHint?: string;
}

export function SamplePicker({
  label,
  placeholder,
  options,
  selected,
  onChange,
  targetCount,
  emptyHint = "No matches",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  const selectAllVisible = () => {
    const next = new Set(selectedSet);
    filtered.forEach((o) => next.add(o.id));
    onChange(Array.from(next));
  };

  const clearAll = () => onChange([]);

  const selectedOptions = options.filter((o) => selectedSet.has(o.id));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-[11px] font-semibold text-[#0f1b3d]">
          {selected.length} selected
          {targetCount ? (
            <span
              className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                selected.length === targetCount
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              / {targetCount} requested
            </span>
          ) : null}
        </span>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between font-normal"
            type="button"
          >
            <span className="truncate text-left">
              {selected.length === 0
                ? placeholder
                : selected.length === 1
                ? selectedOptions[0]?.label ?? "1 selected"
                : `${selected.length} selected`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="h-8 pl-7 text-sm"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={selectAllVisible}
                className="font-medium text-[#0f1b3d] hover:underline"
              >
                Select all{query ? " (matching)" : ""}
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="font-medium text-muted-foreground hover:underline"
                disabled={selected.length === 0}
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyHint}</div>
            ) : (
              filtered.map((o) => {
                const checked = selectedSet.has(o.id);
                return (
                  <button
                    type="button"
                    key={o.id}
                    onClick={() => toggle(o.id)}
                    className={`flex w-full items-start gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary ${
                      checked ? "bg-secondary/60" : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        checked
                          ? "border-[#0f1b3d] bg-[#0f1b3d] text-white"
                          : "border-border bg-background"
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.sublabel && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedOptions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selectedOptions.slice(0, 6).map((o) => (
            <Badge
              key={o.id}
              variant="secondary"
              className="gap-1 pr-1 font-normal"
            >
              <span className="max-w-[120px] truncate">{o.label}</span>
              <button
                type="button"
                onClick={() => toggle(o.id)}
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Remove ${o.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {selectedOptions.length > 6 && (
            <Badge variant="secondary" className="font-normal">
              +{selectedOptions.length - 6} more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
