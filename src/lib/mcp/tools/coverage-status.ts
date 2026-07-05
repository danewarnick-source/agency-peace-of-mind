import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "coverage_status",
  title: "Home coverage status for a date",
  description:
    "For a given date and home (team), returns the coverage requirements and the scheduled shifts that day so the caller can compare and identify gaps.",
  inputSchema: {
    team_id: z.string().uuid().describe("Home / team id."),
    date: z.string().describe("Date in YYYY-MM-DD."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ team_id, date }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    const [requirements, shifts] = await Promise.all([
      sb.from("location_coverage_requirements").select("*").eq("team_id", team_id),
      sb.from("scheduled_shifts").select("*").eq("team_id", team_id).gte("start_time", start).lte("start_time", end),
    ]);
    if (requirements.error) return err(requirements.error.message);
    if (shifts.error) return err(shifts.error.message);
    return ok({
      team_id,
      date,
      requirements: requirements.data ?? [],
      scheduled_shifts: shifts.data ?? [],
    });
  },
});
