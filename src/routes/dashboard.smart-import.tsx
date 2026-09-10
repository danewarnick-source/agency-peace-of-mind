import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import {
  employeeSmartImportRedirect,
  shouldBlockEmployeeSmartImport,
} from "@/lib/employee-smart-import-block";

function modeFromSearch(search: unknown): string | undefined {
  if (!search || typeof search !== "object" || !("mode" in search)) return undefined;
  const mode = (search as { mode?: unknown }).mode;
  return typeof mode === "string" ? mode : undefined;
}

export const Route = createFileRoute("/dashboard/smart-import")({
  beforeLoad: ({ search }) => {
    if (shouldBlockEmployeeSmartImport(modeFromSearch(search))) {
      throw redirect(employeeSmartImportRedirect());
    }
  },
  component: () => <Outlet />,
});
