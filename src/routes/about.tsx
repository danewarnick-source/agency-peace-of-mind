import { createFileRoute } from "@tanstack/react-router";
import { PiAboutPage } from "@/components/pi-landing/pi-about-page";
import { PI_ABOUT_PAGE_DESCRIPTION, PI_ABOUT_PAGE_TITLE } from "@/lib/pi-landing";

const NEWSREADER =
  "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300;0,6..72,400;0,6..72,500;1,6..72,300;1,6..72,400&family=Inter:wght@400;500;600&display=swap";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: PI_ABOUT_PAGE_TITLE },
      { name: "description", content: PI_ABOUT_PAGE_DESCRIPTION },
      { property: "og:title", content: PI_ABOUT_PAGE_TITLE },
      { property: "og:description", content: PI_ABOUT_PAGE_DESCRIPTION },
    ],
    links: [{ rel: "stylesheet", href: NEWSREADER }],
  }),
  component: AboutRoute,
});

function AboutRoute() {
  return <PiAboutPage />;
}
