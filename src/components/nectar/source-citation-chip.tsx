import { BookOpen, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hairline chip used everywhere NECTAR surfaces a checklist item, requirement,
 * or auto-filled value. If `citation` is missing, renders an "unverified /
 * manual" marker so authority is never implied.
 */
export function SourceCitationChip({
  citation,
  className,
}: {
  citation?: string | null;
  className?: string;
}) {
  if (!citation) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700",
          "dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200",
          className,
        )}
        title="Not traced to an uploaded authoritative source — treat as unverified"
      >
        <AlertTriangle className="h-3 w-3" /> Unverified
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border border-border/60 bg-background/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
      title={citation}
    >
      <BookOpen className="h-3 w-3 shrink-0" />
      <span className="truncate">{citation}</span>
    </span>
  );
}
