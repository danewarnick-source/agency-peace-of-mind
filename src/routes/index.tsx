import { createFileRoute, Link } from "@tanstack/react-router";
import { PiWordmark } from "@/components/pi-landing/pi-mark";
import { DuskDeskStill } from "@/components/pi-landing/dusk-desk-still";
import {
  PI_HEADLINE,
  PI_PAGE_DESCRIPTION,
  PI_PAGE_TITLE,
  PI_SUBHEAD,
} from "@/lib/pi-landing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PI_PAGE_TITLE },
      { name: "description", content: PI_PAGE_DESCRIPTION },
      { property: "og:title", content: PI_PAGE_TITLE },
      { property: "og:description", content: PI_PAGE_DESCRIPTION },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: ProviderInterfaceLanding,
});

function ProviderInterfaceLanding() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1220] text-[#f3efe6]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <header
        className="relative z-20 flex items-center justify-between px-5 sm:px-8"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right))",
        }}
      >
        <Link to="/" className="inline-flex items-center" aria-label="Provider Interface home">
          <PiWordmark />
        </Link>
        <Link
          to="/login"
          className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#f3efe6]/75 hover:text-[#f3efe6]"
        >
          Sign in
        </Link>
      </header>

      <main className="relative z-10 flex min-h-[calc(100svh-4.5rem)] flex-col">
        <div className="flex flex-col items-center px-5 pt-8 sm:px-8 sm:pt-10 md:pt-12">
          <h1
            className="max-w-4xl text-center text-[2.35rem] font-medium leading-[1.08] tracking-[-0.02em] text-[#f3efe6] sm:text-6xl md:text-[4.15rem]"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            {PI_HEADLINE}
          </h1>
          <p
            className="mt-3 text-center text-lg font-normal text-[#f3efe6]/68 sm:mt-4 sm:text-xl"
            style={{ fontFamily: '"Newsreader", "Times New Roman", serif' }}
          >
            {PI_SUBHEAD}
          </p>
        </div>

        <div className="mt-auto w-full pb-0">
          <DuskDeskStill />
        </div>
      </main>
    </div>
  );
}
