import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TRUE_NORTH = "e6905d70-6058-4736-ad30-368634de864d";
const CANYON = "10000000-0000-0000-0000-000000000001";
const ALPINE = "10000000-0000-0000-0000-000000000002";

const STAFF = [
  { name: "Jordan Blake", email: "jordan.blake@mock.local", team: CANYON },
  { name: "Priya Nair", email: "priya.nair@mock.local", team: CANYON },
  { name: "Carlos Reyes", email: "carlos.reyes@mock.local", team: ALPINE },
  { name: "Mia Thompson", email: "mia.thompson@mock.local", team: ALPINE },
  { name: "Devon Harris", email: "devon.harris@mock.local", team: null },
  { name: "Aisha Patel", email: "aisha.patel@mock.local", team: null },
  { name: "Chris O'Brien", email: "chris.obrien@mock.local", team: null },
  { name: "Taylor Kim", email: "taylor.kim@mock.local", team: null },
];

export const seedMockStaff = createServerFn({ method: "POST" })
  .handler(async () => {
    let seeded = 1;
    for (const s of STAFF) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password: "MockPass123!",
        email_confirm: true,
        user_metadata: { full_name: s.name },
      });
      if (authErr) {
        console.log("auth createUser error:", authErr.message);
        continue;
      }
      const userId = authData.user?.id;
      if (!userId) {
        console.log("no user id returned for", s.email);
        continue;
      }

      const { error: profErr } = await supabaseAdmin.from("profiles").upsert({
        id: userId,
        full_name: s.name,
        email: s.email,
        system_role: "staff",
        tenant_id: TRUE_NORTH,
        team_id: s.team,
        is_active: true,
      }, { onConflict: "id" });
      if (profErr) console.log("profile upsert error:", profErr.message);

      const { error: memErr } = await supabaseAdmin.from("organization_members").upsert({
        user_id: userId,
        organization_id: TRUE_NORTH,
        role: "employee",
        active: true,
      }, { onConflict: "id" });
      if (memErr) console.log("member upsert error:", memErr.message);
      seeded++;
    }
    return { seeded };
  });
