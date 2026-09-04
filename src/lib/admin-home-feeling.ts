/** Locked Admin Home copy and destinations — feeling-hero B. */

export const ADMIN_HOME_DUSK = "#0B1120";
export const ADMIN_HOME_PALE_GOLD = "#F3E5AB";

export const ADMIN_HOME_EYEBROW = "WELCOME TO YOUR HOME BASE";
export const ADMIN_HOME_HEADLINE = "The day just got smaller";
export const ADMIN_HOME_SUBHEAD =
  "Run the shop in one place. Your staff, clients, and notes—together at last.";
export const ADMIN_HOME_BOARD_CTA = "See today's board →";
export const ADMIN_HOME_FOOTER = "You're all set. Let's make it a great day.";

export const ADMIN_HOME_BOARD_TO = "/dashboard/scheduler" as const;

export const ADMIN_HOME_CARDS = [
  {
    key: "staff",
    title: "Staff ready",
    body: "See who's in, who's up next, and what needs attention.",
    to: "/dashboard/hub/employees",
    cta: "Add employee",
  },
  {
    key: "clients",
    title: "Clients covered",
    body: "Every client, every appointment, all in one calm view.",
    to: "/dashboard/hub/clients",
    cta: "Add client",
  },
  {
    key: "notes",
    title: "Notes done",
    body: "Capture what matters now so you can move on.",
    to: "/dashboard/hub/documentation",
    cta: "Documentation",
  },
] as const;

export type AdminHomeCard = (typeof ADMIN_HOME_CARDS)[number];
