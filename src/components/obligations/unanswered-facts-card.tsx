import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import type { OrgFactDefinition } from "@/lib/obligations/applicability";

type Props = {
  unanswered: OrgFactDefinition[];
  setupHref?: "/dashboard/settings/compliance-setup";
  showSetupLink?: boolean;
};

export function UnansweredFactsCard({
  unanswered,
  setupHref = "/dashboard/settings/compliance-setup",
  showSetupLink = true,
}: Props) {
  if (unanswered.length === 0) return null;
  const count = unanswered.length;

  return (
    <section
      data-testid="unanswered-facts-card"
      className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]"
    >
      <header className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">This week: unanswered setup facts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {count === 1
              ? "1 org-profile fact is still unanswered. Conditional duties stay visible on the register until you record it."
              : `${count} org-profile facts are still unanswered. Conditional duties stay visible on the register until you record them.`}
          </p>
        </div>
      </header>
      <ul className="mt-4 space-y-2">
        {unanswered.map((fact) => (
          <li
            key={fact.key}
            className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
          >
            {fact.question}
          </li>
        ))}
      </ul>
      {showSetupLink ? (
        <p className="mt-4 text-sm">
          <Link
            to={setupHref}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Open compliance setup
          </Link>
        </p>
      ) : null}
    </section>
  );
}
