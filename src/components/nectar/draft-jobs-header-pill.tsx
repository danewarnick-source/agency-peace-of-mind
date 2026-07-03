import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import {
  formatEta,
  useDraftJobsSummary,
} from "@/components/nectar/draft-jobs-driver";

// Small header pill shown while any NECTAR draft-requirement job is
// running. Persists across dashboard pages so users know work is still
// happening after they navigate away from Authoritative Sources.
export function DraftJobsHeaderPill() {
  const { activeCount, minEtaMs } = useDraftJobsSummary();
  if (activeCount === 0) return null;
  const etaLabel = formatEta(minEtaMs);
  return (
    <Link
      to="/dashboard/authoritative-sources"
      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[color:var(--amber-500,#f4a93a)]/40 bg-[color:var(--amber-500,#f4a93a)]/10 px-2.5 py-1 text-xs font-medium text-[color:var(--amber-900,#78350f)] hover:bg-[color:var(--amber-500,#f4a93a)]/20 dark:text-[color:var(--amber-200,#fde68a)]"
      title="NECTAR is drafting requirements from your authoritative sources"
    >
      <Sparkles className="h-3.5 w-3.5 animate-pulse text-[color:var(--amber-600,#d97706)]" />
      <span>
        Drafting {activeCount} source{activeCount === 1 ? "" : "s"}
      </span>
      {etaLabel && (
        <span className="hidden opacity-80 sm:inline">· {etaLabel}</span>
      )}
    </Link>
  );
}
