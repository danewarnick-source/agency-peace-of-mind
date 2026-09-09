import { useLayoutEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";
import { applyPublicPageScroll } from "@/lib/pi-public-scroll";

export function usePiLandingHtmlClass() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("pi-html-landing");
    return () => root.classList.remove("pi-html-landing");
  }, []);
}

export function usePiPublicPageScroll() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  useLayoutEffect(() => {
    applyPublicPageScroll(hash);
  }, [pathname, hash]);
}

export function PiPublicPage({
  children,
  home = false,
}: {
  children: ReactNode;
  home?: boolean;
}) {
  usePiLandingHtmlClass();
  usePiPublicPageScroll();
  return (
    <div className="pi-landing-root pi-home">
      <PiPublicHeader home={home} />
      {children}
      <PiPublicFooter />
    </div>
  );
}
