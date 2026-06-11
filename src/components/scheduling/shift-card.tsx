import { AlertTriangle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { classesForCode, familyForCode } from "@/lib/scheduling/code-colors";

export interface ShiftCardShift {
  id: string;
  starts_at: string;
  ends_at: string;
  staff_id: string | null;
  client_id?: string | null;
  status?: string | null;
  service_code?: string | null;
  job_code?: string | null;
  parent_shift_id?: string | null;
  created_from?: string | null;
  conflict?: boolean;
  warnings?: number;
}

interface Props {
  shift: ShiftCardShift;
  onClick?: () => void;
  className?: string;
  staffName?: string | null;
  clientName?: string | null;
  showFamily?: boolean;
}

/**
 * Unified ShiftCard with status variants:
 * - dashed border if status='draft'
 * - red border if conflict (overlap with another assignment)
 * - amber shield icon if warnings>0
 * - sparkle if created_from='nectar'
 * - inset (ml-3) if parent_shift_id is set (segment)
 *
 * Family color comes from the service code via Tailwind tokens; the left
 * accent stripe additionally uses the semantic CSS var so theming works.
 */
export function ShiftCard({ shift, onClick, className, staffName, clientName, showFamily = true }: Props) {
  const code = (shift.service_code ?? shift.job_code ?? "—").toString();
  const cls = classesForCode(code);
  const isOpen = !shift.staff_id;
  const isDraft = shift.status === "draft";
  const isSegment = !!shift.parent_shift_id;
  const isNectar = shift.created_from === "nectar";
  const hasConflict = !!shift.conflict;
  const hasWarn = (shift.warnings ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative block w-full min-h-[44px] rounded-md border-l-4 px-2 py-1 text-left text-[11px] font-semibold transition-colors hover:brightness-95",
        isSegment && "ml-3",
        isDraft && "border-dashed",
        hasConflict ? "border-destructive bg-destructive/10 text-destructive" :
          isOpen ? "bg-destructive/10 border-destructive text-destructive" :
            `${cls.bgSoft} ${cls.border} ${cls.text}`,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">
          {code}{isSegment && " · seg"}
        </span>
        <span className="flex items-center gap-1">
          {hasWarn && <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="warnings" />}
          {isNectar && <Sparkles className="h-3 w-3 text-violet-500" aria-label="NECTAR draft" />}
          {showFamily && (
            <Badge variant="outline" className="text-[9px] capitalize">
              {familyForCode(code).replace("_", " ")}
            </Badge>
          )}
        </span>
      </div>
      <div className="text-[10px] font-medium opacity-80 truncate">
        {new Date(shift.starts_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        {"–"}
        {new Date(shift.ends_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        {isOpen && " · open"}
        {staffName && !isOpen && ` · ${staffName}`}
        {clientName && ` · ${clientName}`}
      </div>
    </button>
  );
}
