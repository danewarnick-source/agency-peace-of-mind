import { useMemo, useRef, useState, useEffect } from "react";
import { Search, X, ChevronDown, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";
import { cn } from "@/lib/utils";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function DspdCodesMultiSelect({ value, onChange }: Props) {
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EVV_SERVICE_CODES;
    return EVV_SERVICE_CODES.filter(
      (c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q),
    );
  }, [query]);

  const toggle = (code: string) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div ref={wrapRef} className="relative">
      {/* Chip / input frame */}
      <div
        className="flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm cursor-text"
        onClick={() => setOpen(true)}
      >
        {value.length === 0 && (
          <span className="px-1 text-muted-foreground">Search & select authorized codes…</span>
        )}
        {value.map((code) => {
          const def = EVV_SERVICE_CODES.find((c) => c.code === code);
          const isEvv = !!def?.evvLock;
          return (
            <Badge
              key={code}
              variant="outline"
              className={cn(
                "gap-1 font-mono",
                isEvv
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-muted-foreground/30 bg-muted text-foreground",
              )}
              title={def?.label ?? code}
            >
              {code}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(code);
                }}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10"
                aria-label={`Remove ${code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          );
        })}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          aria-label="Toggle DSPD code list"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-2 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter (e.g. HHS or Personal Assistance)…"
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No codes match "{query}"
              </p>
            ) : (
              filtered.map((c) => {
                const selected = value.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggle(c.code)}
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
                    <span className="flex-1">
                      <span className="font-mono font-medium">{c.code}</span>
                      <span className="text-muted-foreground"> — {c.label.split("— ")[1] ?? c.label}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        c.evvLock
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {c.evvLock ? "EVV Lock" : "Bypass"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>{value.length} selected · {EVV_SERVICE_CODES.length} total codes</span>
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
