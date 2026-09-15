import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PageShellSkeleton } from "@/components/page-shell";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Nested dashboard content scrolls its own [data-scroll-restoration-id]
    // container, not window. Without this, TanStack's own scroll-restoration
    // copies the FROM page's offset onto the TO page's cache entry and
    // restores it — the "opens scrolled to where the last page was" bug.
    // Listing the container here excludes it from that carry-over and makes
    // the router snap it to top on every fresh navigation instead.
    scrollToTopSelectors: [
      '[data-scroll-restoration-id="dashboard-main"]',
      "[data-staff-phone-scroller]",
    ],
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
    defaultPendingComponent: PageShellSkeleton,
    defaultPendingMs: 150,
  });

  return router;
};
