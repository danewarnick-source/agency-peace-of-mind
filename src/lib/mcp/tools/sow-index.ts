import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthed, ok } from "./_shared";
import { searchSowIndex, sowIndexRowCount } from "../../sow-index.ts";

export default defineTool({
  name: "sow_index",
  title: "Search the Agency Contract / SOW index",
  description:
    "Searches the static DHHS91172 SOW index (catalog, perimeters R1–R5, standing duties, EVV/daily-rate/cadence rows). Titles and citations only — no PHI, no live org data.",
  inputSchema: {
    query: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const cap = Math.min(100, limit ?? 25);
    const rows = searchSowIndex(query ?? "").slice(0, cap);
    return ok({
      total: sowIndexRowCount(),
      returned: rows.length,
      rows,
    });
  },
});
