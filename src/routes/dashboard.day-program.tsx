import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/day-program")({
  head: () => ({ meta: [{ title: "Day Program — HIVE" }] }),
  component: DayProgramPage,
});

function DayProgramPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-10 space-y-3">
      <h1 className="text-2xl font-bold">Day Program</h1>
      <p className="text-sm text-muted-foreground">
        This page hasn't been built yet.{" "}
        <Link to="/dashboard" className="underline">Return to dashboard</Link>.
      </p>
    </div>
  );
}
