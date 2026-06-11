/**
 * teams → locations type mapping. `teams` is the source of truth for homes;
 * every scheduler location is derived from a team's setting/team_type:
 *   contains "host"    → host_home
 *   contains "day"     → day_site
 *   contains "communi" → community
 *   everything else    → residential
 */
export type LocationType = "residential" | "host_home" | "day_site" | "community";

export function locationTypeForTeam(
  setting: string | null | undefined,
  teamType?: string | null,
): LocationType {
  const v = `${setting ?? ""} ${teamType ?? ""}`.toLowerCase();
  if (v.includes("host")) return "host_home";
  if (v.includes("day")) return "day_site";
  if (v.includes("communi")) return "community";
  return "residential";
}
