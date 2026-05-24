import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TRUE_NORTH = "e6905d70-6058-4736-ad30-368634de864d";
const CANYON = "10000000-0000-0000-0000-000000000001";
const ALPINE = "10000000-0000-0000-0000-000000000002";

const STAFF = [
  { id: "eeee1111-eeee-1111-eeee-111111111111", name: "Jordan Blake", email: "jordan.blake@mock.local", team: CANYON },
  { id: "eeee2222-eeee-2222-eeee-222222222222", name: "Priya Nair", email: "priya.nair@mock.local", team: CANYON },
  { id: "eeee3333-eeee-3333-eeee-333333333333", name: "Carlos Reyes", email: "carlos.reyes@mock.local", team: ALPINE },
  { id: "eeee4444-eeee-4444-eeee-444444444444", name: "Mia Thompson", email: "mia.thompson@mock.local", team: ALPINE },
  { id: "eeee5555-eeee-5555-eeee-555555555555", name: "Devon Harris", email: "devon.harris@mock.local", team: null },
  { id: "eeee6666-eeee-6666-eeee-666666666666", name: "Aisha Patel", email: "aisha.patel@mock.local", team: null },
  { id: "eeee7777-eeee-7777-eeee-777777777777", name: "Chris O'Brien", email: "chris.obrien@mock.local", team: null },
  { id: "eeee8888-eeee-8888-eeee-888888888888", name: "Taylor Kim", email: "taylor.kim@mock.local", team: null },
];

export const seedMockStaff = createServerFn({ method: "POST" })
  .handler(async () => {
    for (const s of STAFF) {
      const { error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password: "MockPass123!",
        email_confirm: true,
        user_metadata: { full_name: s.name },
      });
      if (authErr) {
        console.log("auth createUser error (may already exist):", authErr.message);
      }

      const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
        id: s.id,
        full_name: s.name,
        email: s.email,
        system_role: "staff",
        tenant_id: TRUE_NORTH,
        team_id: s.team,
        is_active: true,
      }, { onConflict: "id" });
      if (profErr) console.log("profile upsert error:", profErr.message);

      const { error: memErr } = await supabaseAdmin.from("organization_members").upsert({
        id: s.id,
        user_id: s.id,
        organization_id: TRUE_NORTH,
        role: "employee",
        active: true,
      }, { onConflict: "id" });
      if (memErr) console.log("member upsert error:", memErr.message);
    }
    return { seeded: STAFF.length };
  });
