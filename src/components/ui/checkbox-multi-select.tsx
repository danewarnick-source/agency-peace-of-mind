// Generic search-and-check multi-select.
// Used by the Approved-EVV Archive for the staff, client, code, and home/team filters.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface CheckboxMultiSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  options: CheckboxMultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  chipMonospace?: boolean;
  /** Max chips to render inline before showing "+N more". */
  maxChips?: number;
}

export function CheckboxMultiSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to filter…",
  emptyLabel = "No matches",
  chipMonospace = false,
  maxChips = 3,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const optionByValue = useMemo(() => {
    const m = new Map<string, CheckboxMultiSelectOption>();
    for (const o of options) m.set(o.value, o);
    return m;
  }, [options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        (o.sublabel ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  const visibleChips = value.slice(0, maxChips);
  const extraChipCount = Math.max(0, value.length - visibleChips.length);

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <div
        className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm cursor-text"
        onClick={() => setOpen(true)}
      >
        {value.length === 0 && (
          <span className="px-1 text-muted-foreground">{placeholder}</span>
        )}
        {visibleChips.map((v) => {
          const o = optionByValue.get(v);
          return (
            <Badge
              key={v}
              variant="outline"
              className={cn("gap-1", chipMonospace && "font-mono")}
              title={o?.label ?? v}
            >
              <span className="max-w-[140px] truncate">{o?.label ?? v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(v);
                }}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10"
                aria-label={`Remove ${o?.label ?? v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        {extraChipCount > 0 && (
          <Badge variant="secondary" className="text-[11px]">
            +{extraChipCount} more
          </Badge>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          aria-label="Toggle list"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {emptyLabel}
              </p>
            ) : (
              filtered.map((o) => {
                const selected = value.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                      selected && "bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={cn("font-medium", chipMonospace && "font-mono")}>
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className="ml-1 text-muted-foreground">— {o.sublabel}</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              {value.length} selected · {options.length} total
            </span>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-destructive hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
