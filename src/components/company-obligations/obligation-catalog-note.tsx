/**
 * Extracted from ObligationCard so the catalog note block isn't an IIFE.
 */
import { catalogFor, dueExplanationFor } from "./obligation-meta";
import type { CompanyObligationRow } from "@/lib/company-obligations.functions";

export function ObligationCatalogNote({ obligation }: { obligation: CompanyObligationRow }) {
  const catalog = catalogFor(obligation);
  const dueText = dueExplanationFor(obligation);
  if (!catalog && !dueText) return null;
  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-border bg-muted/20 p-2.5 text-xs text-muted-foreground">
      {dueText && (
        <p>
          <span className="font-medium text-foreground">Due date rule: </span>
          {dueText}
          {catalog?.calendar_is_reminder_only
            ? " This calendar date is a verification reminder — the duty is to keep the record current."
            : ""}
        </p>
      )}
      {catalog?.fulfillment_note && (
        <p>
          <span className="font-medium text-foreground">What HIVE tracks: </span>
          {catalog.fulfillment_note}
        </p>
      )}
      {catalog?.evidence_standard && (
        <p>
          <span className="font-medium text-foreground">Evidence a reviewer expects: </span>
          {catalog.evidence_standard}
        </p>
      )}
      {catalog?.applicability === "when_applicable" && catalog.applicability_note && (
        <p>
          <span className="font-medium text-foreground">When this applies: </span>
          {catalog.applicability_note}
        </p>
      )}
    </div>
  );
}
