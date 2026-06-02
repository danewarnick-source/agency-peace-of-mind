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
  // Fill the staff mobile shell's <main> (which is flex-1 overflow-y-auto).
  // Use absolute positioning so the chat occupies the entire main area
  // without inheriting its scroll — internal scroll lives on the message
  // thread only, and the composer stays pinned to the bottom.
  return (
    <div className="absolute inset-0 mx-auto flex w-full max-w-3xl flex-col overflow-hidden bg-card md:relative md:inset-auto md:h-[calc(100vh-8rem)] md:rounded-2xl md:border md:border-border md:shadow-[var(--shadow-card)]">
      <AskNectarStaff clientId={clientId} />
    </div>
  );
}
