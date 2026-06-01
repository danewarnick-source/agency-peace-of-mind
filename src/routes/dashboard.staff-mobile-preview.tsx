import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Smartphone, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/staff-mobile-preview")({
  head: () => ({ meta: [{ title: "Staff Mobile Preview — HIVE" }] }),
  component: StaffMobilePreviewPage,
});

const ROUTES = [
  { path: "/dashboard", label: "My Caseload" },
  { path: "/dashboard/timeclock", label: "Time Clock" },
  { path: "/dashboard/daily-logs", label: "Daily Logs" },
  { path: "/dashboard/courses", label: "Trainings" },
];

function StaffMobilePreviewPage() {
  const [route, setRoute] = useState("/dashboard");
  const [nonce, setNonce] = useState(0);
  const src = `${route}?staffPreview=1#n=${nonce}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Smartphone className="h-5 w-5 text-[#f4a93a]" /> Staff Mobile Preview
        </h1>
        <p className="text-sm text-muted-foreground">
          Temporary admin tool — see exactly what staff and host families see on their phones.
          This is a live, sandboxed view of the staff portal at a 390×844 viewport.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        {ROUTES.map((r) => (
          <Button
            key={r.path}
            size="sm"
            variant={route === r.path ? "default" : "outline"}
            onClick={() => setRoute(r.path)}
          >
            {r.label}
          </Button>
        ))}
        <div className="ml-auto">
          <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reload
          </Button>
        </div>
      </div>

      <div className="flex justify-center py-6">
        <div
          className="relative rounded-[44px] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl"
          style={{ width: 390 + 20, height: 844 + 20 }}
        >
          <div className="absolute left-1/2 top-1.5 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-neutral-900" />
          <iframe
            key={nonce}
            title="Staff mobile preview"
            src={src}
            className="h-full w-full overflow-hidden rounded-[34px] bg-white"
            style={{ width: 390, height: 844 }}
          />
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Interactions inside the phone use the same session and database — be mindful when clocking
        in/out or submitting forms.
      </p>
    </div>
  );
}
