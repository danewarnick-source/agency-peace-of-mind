import { createFileRoute } from "@tanstack/react-router";
import { PiMarketingPage } from "@/components/pi-landing/pi-marketing-page";
import { PI_PAGE_DESCRIPTION, PI_PAGE_TITLE } from "@/lib/pi-landing";

const INTER =
  "https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap";

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
    links: [{ rel: "stylesheet", href: INTER }],
  }),
  component: ProviderInterfaceLanding,
});

function ProviderInterfaceLanding() {
  return <PiMarketingPage />;
}
