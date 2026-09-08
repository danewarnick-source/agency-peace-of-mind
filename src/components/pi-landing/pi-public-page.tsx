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

export function PiPublicPage({
  children,
  home = false,
}: {
  children: ReactNode;
  home?: boolean;
}) {
  usePiLandingHtmlClass();
  return (
    <div className={home ? "pi-landing-root pi-home" : "pi-landing-root"}>
      {home ? null : <div className="grain" aria-hidden />}
      <PiPublicHeader home={home} />
      {children}
      <PiPublicFooter home={home} />
    </div>
  );
}
