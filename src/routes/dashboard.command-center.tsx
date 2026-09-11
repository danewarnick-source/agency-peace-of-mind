import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired Agency Command Center. Admin Home is the product surface.
 * Keep this route file so old bookmarks resolve without a 404.
 */
export const Route = createFileRoute("/dashboard/command-center")({
  head: () => ({ meta: [{ title: "Home — Provider Interface" }] }),
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard",
      replace: true,
    });
  },
});
