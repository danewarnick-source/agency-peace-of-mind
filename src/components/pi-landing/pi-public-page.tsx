import { useLayoutEffect, type ReactNode } from "react";
import { PiPublicHeader } from "@/components/pi-landing/pi-public-header";
import { PiPublicFooter } from "@/components/pi-landing/pi-public-footer";

export function usePiLandingHtmlClass() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("pi-html-landing");
    return () => root.classList.remove("pi-html-landing");
  }, []);
}

export function PiPublicPage({ children }: { children: ReactNode }) {
  usePiLandingHtmlClass();
  return (
    <div className="pi-landing-root">
      <div className="grain" aria-hidden />
      <PiPublicHeader />
      {children}
      <PiPublicFooter />
    </div>
  );
}
