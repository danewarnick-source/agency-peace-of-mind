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
  // Fill the staff mobile shell's <main> exactly — no page scroll. The shell
  // applies px-4 py-5 to <main>; negate it on mobile so the chat occupies the
  // full frame between the top bar and bottom tabs. Internal scroll lives on
  // the message thread; the composer stays pinned at the bottom.
  return (
    <div className="-mx-4 -my-5 flex h-[calc(100%+2.5rem)] min-h-0 flex-col overflow-hidden bg-card md:mx-auto md:my-0 md:h-[calc(100vh-8rem)] md:w-full md:max-w-3xl md:rounded-2xl md:border md:border-border md:shadow-[var(--shadow-card)]">
      <AskNectarStaff clientId={clientId} />
    </div>
  );
}
