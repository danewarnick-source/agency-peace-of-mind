import { createFileRoute, useSearch } from "@tanstack/react-router";
import { AskNectarStaff } from "@/components/staff-mobile/ask-nectar-staff";
import { FeatureGate } from "@/components/upgrade-gate";

interface AskNectarSearch {
  clientId?: string;
  q?: string;
}

export const Route = createFileRoute("/dashboard/ask-nectar")({
  head: () => ({ meta: [{ title: "Ask NECTAR — Staff" }] }),
  validateSearch: (search: Record<string, unknown>): AskNectarSearch => ({
    clientId:
      typeof search.clientId === "string" && /^[0-9a-f-]{36}$/i.test(search.clientId)
        ? search.clientId
        : undefined,
    q: typeof search.q === "string" && search.q.trim().length > 0
      ? search.q.slice(0, 1000)
      : undefined,
  }),
  component: AskNectarStaffPage,
});

function AskNectarStaffPage() {
  const { clientId, q } = useSearch({ from: "/dashboard/ask-nectar" });
  return (
    <FeatureGate featureKey="nectar">
      <div className="-mx-4 -my-5 flex h-[calc(100%+2.5rem)] min-h-0 flex-col overflow-hidden bg-card md:mx-auto md:my-0 md:h-[calc(100vh-8rem)] md:w-full md:max-w-3xl md:rounded-2xl md:border md:border-border md:shadow-[var(--shadow-card)]">
        <AskNectarStaff clientId={clientId} initialQuestion={q} />
      </div>
    </FeatureGate>
  );
}
