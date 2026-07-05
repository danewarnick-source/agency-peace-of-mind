import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, notAuthed, ok, err } from "./_shared";

export default defineTool({
  name: "get_client",
  title: "Get client details",
  description:
    "Returns a client record with related billing codes and emergency contacts. Row-level security applies.",
  inputSchema: {
    client_id: z.string().uuid().describe("Client UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ client_id }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthed();
    const sb = supabaseForUser(ctx);
    const [client, billing, contacts] = await Promise.all([
      sb.from("clients").select("*").eq("id", client_id).maybeSingle(),
      sb.from("client_billing_codes").select("*").eq("client_id", client_id),
      sb.from("client_emergency_contacts").select("*").eq("client_id", client_id),
    ]);
    if (client.error) return err(client.error.message);
    if (!client.data) return err("Client not found or not visible.");
    return ok({
      client: client.data,
      billing_codes: billing.data ?? [],
      emergency_contacts: contacts.data ?? [],
    });
  },
});
