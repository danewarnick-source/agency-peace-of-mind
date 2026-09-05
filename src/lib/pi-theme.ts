/**
 * Locked Provider Interface visual tokens — landing and Admin chrome share this
 * object so colors cannot drift. Values match Dane's PI HTML landing CSS.
 */

export const PI_GRAIN_SVG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>";

export const PI_THEME = {
  navy: "#0a1120",
  n1: "#0e1729",
  n2: "#121d33",
  n3: "#17243d",
  sideTop: "#121d33",
  sideBot: "#0a1120",
  cream: "#f3efe6",
  c70: "rgba(243, 239, 230, 0.72)",
  c50: "rgba(243, 239, 230, 0.5)",
  c30: "rgba(243, 239, 230, 0.3)",
  c14: "rgba(243, 239, 230, 0.14)",
  c08: "rgba(243, 239, 230, 0.08)",
  c04: "rgba(243, 239, 230, 0.04)",
  gold: "#c9a227",
  goldSoft: "rgba(201, 162, 39, 0.16)",
  ok: "#5fae7f",
  red: "#e08a80",
  amber: "#d4af37",
  serif: '"Newsreader", Georgia, serif',
  sans: '"Inter", system-ui, sans-serif',
  shadow1:
    "0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px -8px rgba(0, 0, 0, 0.6)",
  shadow2:
    "0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 2px 4px rgba(0, 0, 0, 0.45), 0 24px 48px -16px rgba(0, 0, 0, 0.7)",
  cardBg: "linear-gradient(180deg, #121d33, #0e1729)",
  heroTileBg: "linear-gradient(135deg, #121d33, #0e1729 60%, #0c1425)",
  hairlines: {
    faint: "rgba(243, 239, 230, 0.08)",
    soft: "rgba(243, 239, 230, 0.14)",
    mid: "rgba(243, 239, 230, 0.3)",
  },
  buttons: {
    primaryBg: "linear-gradient(180deg, #fbf8f1, #e9e3d6)",
    primaryFg: "#0a1120",
    primaryShadow:
      "0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 -1px 0 rgba(0, 0, 0, 0.08) inset, 0 6px 16px -6px rgba(243, 239, 230, 0.35)",
    secondaryBg: "linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))",
    secondaryFg: "#f3efe6",
    secondaryBorder: "rgba(243, 239, 230, 0.14)",
  },
  avatarBg: ["#17243d", "#121d33"] as const,
  pageGlow:
    "radial-gradient(900px 520px at 18% -8%, rgba(201, 162, 39, 0.1), transparent 60%), radial-gradient(1100px 700px at 88% 8%, rgba(60, 90, 150, 0.22), transparent 62%), radial-gradient(800px 600px at 50% 110%, rgba(30, 58, 95, 0.35), transparent 60%)",
  grainOpacity: 0.045,
} as const;

export type PiTheme = typeof PI_THEME;
