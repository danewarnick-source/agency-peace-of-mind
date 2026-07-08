/**
 * GoverningSourceBadge — shows which document version governed a
 * point-in-time read. Used wherever a report or evaluation is scoped to a
 * past date so the provider/auditor can see exactly which SOW/PCSP/etc.
 * was in effect then.
 */
import { FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GoverningSource } from "@/lib/effective-document";

export function GoverningSourceBadge({
  source,
  asOf,
  className,
}: {
  source: GoverningSource;
  asOf?: string; // "now" or YYYY-MM-DD for context
  className?: string;
}) {
  const missing = !source.documentId;
  const Icon = missing ? AlertTriangle : FileText;
  return (
    <Badge
      variant={missing ? "outline" : "secondary"}
      className={`inline-flex max-w-full items-center gap-1.5 whitespace-normal text-left text-[11px] font-normal ${
        missing ? "border-amber-400/60 text-amber-800 dark:text-amber-300" : ""
      } ${className ?? ""}`}
      title={asOf && asOf !== "now" ? `Point-in-time read as of ${asOf}` : "Current source"}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{source.label}</span>
    </Badge>
  );
}
