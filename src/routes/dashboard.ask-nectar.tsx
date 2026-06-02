import { createFileRoute, useSearch } from "@tanstack/react-router";
import { AskNectarStaff } from "@/components/staff-mobile/ask-nectar-staff";

interface AskNectarSearch {
  clientId?: string;
}

export const Route = createFileRoute("/dashboard/ask-nectar")({
  head: () => ({ meta: [{ title: "Ask NECTAR — Staff" }] }),
  validateSearch: (search: Record<string, unknown>): AskNectarSearch => ({
    clientId:
      typeof search.clientId === "string" && /^[0-9a-f-]{36}$/i.test(search.clientId)
        ? search.clientId
        : undefined,
  }),
  component: AskNectarStaffPage,
});

function AskNectarStaffPage() {
  const { clientId } = useSearch({ from: "/dashboard/ask-nectar" });
  return (
    <div className="-mx-3 -my-4 h-[calc(100vh-9rem)] md:mx-0 md:my-0 md:h-[calc(100vh-8rem)] md:overflow-hidden md:rounded-2xl md:border md:border-border md:bg-card md:shadow-sm">
      <AskNectarStaff clientId={clientId} />
    </div>
  );
}
