import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Legacy Deadlines page — staff dues live on Staff file.
 * Keep this route file so old bookmarks resolve without a 404.
 */
export const Route = createFileRoute("/dashboard/deadlines")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/compliance",
      search: { tab: "staff" },
      replace: true,
    });
  },
});
