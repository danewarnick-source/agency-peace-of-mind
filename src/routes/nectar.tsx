import { createFileRoute } from "@tanstack/react-router";
import { PiNectarPage } from "@/components/pi-landing/pi-nectar-page";
import { PI_NECTAR_PAGE_DESCRIPTION, PI_NECTAR_PAGE_TITLE } from "@/lib/pi-landing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=Inter:wght@400;500;600&display=swap";

export const Route = createFileRoute("/nectar")({
  head: () => ({
    meta: [
      { title: PI_NECTAR_PAGE_TITLE },
      { name: "description", content: PI_NECTAR_PAGE_DESCRIPTION },
      { property: "og:title", content: PI_NECTAR_PAGE_TITLE },
      { property: "og:description", content: PI_NECTAR_PAGE_DESCRIPTION },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: NectarRoute,
});

function NectarRoute() {
  return <PiNectarPage />;
}
