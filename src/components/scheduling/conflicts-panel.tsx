// Toolbar conflicts popover. Shows a count badge and a list of conflicts grouped
// by severity. Clicking a row invokes onJumpToShift so the host page can deep-
// link to the shift in question.

import { useState } from "react";
import { AlertCircle, AlertTriangle, ChevronDown, ShieldAlert } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Conflict } from "@/lib/scheduling/conflicts";
import { summarizeBySeverity } from "@/lib/scheduling/conflicts";

interface Props {
  conflicts: Conflict[];
  onJumpToShift?: (shiftId: string) => void;
  shiftLabel?: (shiftId: string) => string;
}

const SEV_META = {
  hard: { label: "Hard", icon: AlertCircle, cls: "text-destructive bg-destructive/10 border-destructive/30" },
  policy_block: { label: "Block", icon: ShieldAlert, cls: "text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-300 dark:bg-amber-950" },
  policy_warn: { label: "Warn", icon: AlertTriangle, cls: "text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-300 dark:bg-amber-950" },
  warn: { label: "Note", icon: AlertTriangle, cls: "text-muted-foreground bg-muted border-border" },
} as const;

export function ConflictsPanel({ conflicts, onJumpToShift, shiftLabel }: Props) {
  const [open, setOpen] = useState(false);
  const { hard, block, warn, total } = summarizeBySeverity(conflicts);
  const tone = hard > 0 ? "destructive" : block > 0 ? "amber" : warn > 0 ? "muted" : "ok";

  // Sort: hard → block → warn → note, then by code.
  const order: Record<Conflict["severity"], number> = {
    hard: 0, policy_block: 1, policy_warn: 2, warn: 3,
  };
  const sorted = [...conflicts].sort((a, b) =>
    order[a.severity] - order[b.severity] || a.code.localeCompare(b.code));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-9",
            tone === "destructive" && "border-destructive text-destructive hover:bg-destructive/10",
            tone === "amber" && "border-amber-300 text-amber-700 hover:bg-amber-50 dark:text-amber-300",
          )}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Conflicts
          <span className="ml-1 rounded-full bg-background/70 px-1.5 text-[11px] font-semibold tabular-nums">
            {total}
          </span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0">
        <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {total === 0 ? "No conflicts in view" : (
            <span>
              {hard > 0 && <span className="text-destructive">{hard} hard</span>}
              {hard > 0 && (block + warn > 0) && " · "}
              {block > 0 && <span className="text-amber-700 dark:text-amber-300">{block} block</span>}
              {block > 0 && warn > 0 && " · "}
              {warn > 0 && <span>{warn} warn</span>}
            </span>
          )}
        </div>
        <div className="max-h-[420px] overflow-y-auto py-1">
          {sorted.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              All clear for this week.
            </div>
          ) : sorted.map((c, i) => {
            const meta = SEV_META[c.severity];
            const Icon = meta.icon;
            return (
              <button
                key={`${c.shiftId}-${c.code}-${i}`}
                type="button"
                onClick={() => { setOpen(false); onJumpToShift?.(c.shiftId); }}
                className="flex w-full gap-2 border-b px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/50"
              >
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0",
                  c.severity === "hard" && "text-destructive",
                  (c.severity === "policy_block" || c.severity === "policy_warn") && "text-amber-600",
                  c.severity === "warn" && "text-muted-foreground")} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-snug">{c.message}</div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {shiftLabel?.(c.shiftId) ?? c.shiftId.slice(0, 8)} · {meta.label}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
