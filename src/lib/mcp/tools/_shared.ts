import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export function notAuthed() {
  return {
    content: [{ type: "text" as const, text: "Not authenticated" }],
    isError: true,
  };
}

export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: { data } as Record<string, unknown>,
  };
}

export function err(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
