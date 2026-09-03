import { createFileRoute } from "@tanstack/react-router";
import { PiMarketingPage } from "@/components/pi-landing/pi-marketing-page";
import { PI_PAGE_DESCRIPTION, PI_PAGE_TITLE } from "@/lib/pi-landing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PI_PAGE_TITLE },
      { name: "description", content: PI_PAGE_DESCRIPTION },
      { property: "og:title", content: PI_PAGE_TITLE },
      { property: "og:description", content: PI_PAGE_DESCRIPTION },
      { name: "twitter:title", content: PI_PAGE_TITLE },
      { name: "twitter:description", content: PI_PAGE_DESCRIPTION },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: ProviderInterfaceLanding,
});

function ProviderInterfaceLanding() {
  return <PiMarketingPage />;
}
