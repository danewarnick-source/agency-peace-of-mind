import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The standalone RHS planning board was retired. This route now redirects
 * for any old bookmarks / links.
 */
export const Route = createFileRoute("/dashboard/clients/rhs-board")({
  beforeLoad: () => {
    throw redirect({
      to: "/dashboard/hub/clients",
    });
  },
});
