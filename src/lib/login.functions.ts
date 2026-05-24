import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LookupInput = z.object({ username: z.string().trim().min(1).max(60) });

export const lookupEmailByUsername = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => LookupInput.parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .ilike("username", data.username)
      .maybeSingle();

    return { email: row?.email ?? null };
  });