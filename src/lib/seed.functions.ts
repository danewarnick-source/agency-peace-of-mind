import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TRUE_NORTH = "e6905d70-6058-4736-ad30-368634de864d";
const CANYON = "10000000-0000-0000-0000-000000000001";
const ALPINE = "10000000-0000-0000-0000-000000000002";

const STAFF = [
  { name: "Michael Chang", email: "michael.chang@mock.local", team: ALPINE, position: "Direct Support Professional" },
  { name: "Sarah Jenkins", email: "sarah.jenkins@mock.local", team: ALPINE, position: "Behavior Technician" },
  { name: "David Cho", email: "david.cho@mock.local", team: CANYON, position: "Residential Caregiver" },
  { name: "Elena Rostova", email: "elena.rostova@mock.local", team: CANYON, position: "Certified Nursing Assistant" },
  { name: "Amira Patel", email: "amira.patel@mock.local", team: null, position: "QIDP" },
  { name: "Tyrone Brooks", email: "tyrone.brooks@mock.local", team: null, position: "Non-Emergency Medical Driver" },
  { name: "Jessica Miller", email: "jessica.miller@mock.local", team: null, position: "Job Coach / Employment Specialist" },
  { name: "Carlos Mendez", email: "carlos.mendez@mock.local", team: null, position: "Direct Support Professional" },
];

export const seedMockStaff = createServerFn({ method: "POST" })
  .handler(async () => {
    let seeded = 0;
    for (const s of STAFF) {
      let userId: string | undefined;
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email: s.email,
        password: "MockPass123!",
        email_confirm: true,
        user_metadata: { full_name: s.name },
      });
      if (authErr) {
        // Likely already exists — look up
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = list?.users.find((u) => u.email?.toLowerCase() === s.email.toLowerCase())?.id;
      } else {
        userId = authData.user?.id;
      }
      if (!userId) continue;

      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        full_name: s.name,
        email: s.email,
        system_role: "staff",
        position: s.position,
        tenant_id: TRUE_NORTH,
        team_id: s.team,
        is_active: true,
      }, { onConflict: "id" });

      // Check existing membership to avoid duplicate
      const { data: existing } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_id", TRUE_NORTH)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("organization_members").insert({
          user_id: userId,
          organization_id: TRUE_NORTH,
          role: "employee",
          active: true,
          job_title: s.position,
        });
      }
      seeded++;
    }
    return { seeded };
  });
