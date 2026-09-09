/**
 * Public / pre-login scroll.
 *
 * Marketing pages scroll the window (not a nested <main>). TanStack Router's
 * `scrollRestoration: true` still leaves people mid-page on mobile when:
 *
 * 1. A leftover homepage hash (#nectar / #training / #pricing) is carried
 *    onto the next route. Restoration then skips window-to-top and looks for
 *    that id — which usually is not on the destination.
 * 2. Shared PiPublicPage chrome remounts while window.scrollY stays put.
 *
 * Call `applyPublicPageScroll` on pathname/hash change (layout effect).
 * Honor an intentional hash only when that id exists on the new page.
 */

export function publicHashId(hash: string | undefined | null): string {
  if (!hash) return "";
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

export function shouldScrollPublicPageToTop(hash: string | undefined | null): boolean {
  const id = publicHashId(hash);
  if (!id) return true;
  if (typeof document === "undefined") return false;
  return document.getElementById(id) === null;
}

export function resetPublicPageScroll(): void {
  if (typeof document !== "undefined") {
    const scrolling = document.scrollingElement ?? document.documentElement;
    scrolling.scrollTop = 0;
    scrolling.scrollLeft = 0;
    document.documentElement.scrollTop = 0;
    document.documentElement.scrollLeft = 0;
    if (document.body) {
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
    }
  }
  if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
    window.scrollTo(0, 0);
  }
}

export function applyPublicPageScroll(hash: string | undefined | null): void {
  const id = publicHashId(hash);
  if (id && typeof document !== "undefined") {
    const el = document.getElementById(id);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "start", behavior: "auto" });
      return;
    }
  }
  resetPublicPageScroll();
}
