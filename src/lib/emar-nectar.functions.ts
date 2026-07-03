import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gatewayFetch } from "@/lib/ai-bedrock.server";

const Input = z.object({
  clientId: z.string().uuid(),
  kind: z.enum([
    "refusal_then_success",
    "controlled_history",
    "swallowing_risk_meds",
    "documentation_gap_check",
  ]),
  medicationId: z.string().uuid().optional().nullable(),
});

export const emarNectarHelper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: client } = await supabase
      .from("clients")
      .select("id, first_name, last_name, organization_id")
      .eq("id", data.clientId)
      .single();
    if (!client) throw new Error("Client not found.");
    const c = client as { first_name: string; last_name: string };
    const personName = `${c.first_name} ${c.last_name}`;

    // Build factual context from real records (no fabrication)
    let factualContext = "";
    if (data.kind === "refusal_then_success") {
      const { data: logs } = await supabase
        .from("emar_logs")
        .select(
          "scheduled_for, actual_taken_at, status, exception_reason, staff_name, medication_id, service_context",
        )
        .eq("client_id", data.clientId)
        .order("scheduled_for", { ascending: false })
        .limit(60);
      factualContext = JSON.stringify(logs ?? []);
    } else if (data.kind === "controlled_history") {
      const { data: counts } = await supabase
        .from("controlled_med_counts")
        .select("created_at, context, expected_count, counted_value, variance, flagged, staff_name, medication_id")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(80);
      factualContext = JSON.stringify(counts ?? []);
    } else if (data.kind === "swallowing_risk_meds") {
      const { data: meds } = await supabase
        .from("client_medications")
        .select("medication_name, dosage, side_effects, choking_risk, choking_risk_details, contributes_to_swallowing_difficulty")
        .eq("client_id", data.clientId)
        .eq("is_active", true);
      factualContext = JSON.stringify(meds ?? []);
    } else if (data.kind === "documentation_gap_check") {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: logs } = await supabase
        .from("emar_logs")
        .select("scheduled_for, status, medication_id")
        .eq("client_id", data.clientId)
        .gte("scheduled_for", since.toISOString());
      const { data: meds } = await supabase
        .from("client_medications")
        .select("id, medication_name, scheduled_times, is_active, is_prn")
        .eq("client_id", data.clientId)
        .eq("is_active", true);
      factualContext = JSON.stringify({ logs: logs ?? [], meds: meds ?? [] });
    }

    const promptByKind: Record<typeof data.kind, string> = {
      refusal_then_success:
        "Surface any refused dose followed by a later successful self-administration of the same medication on the same day. Show a clear before/after timeline. Cite exact timestamps and the staff name on each entry. Do NOT invent any entry not present in the data.",
      controlled_history:
        "Summarize the controlled-substance count history for this Person. Call out any flagged variances and shift-change counts. Cite exact timestamps and counted vs expected.",
      swallowing_risk_meds:
        "List medications on file that may worsen swallowing — anything with choking_risk = true, contributes_to_swallowing_difficulty = true, or side_effects implying dry mouth, sedation, or sialorrhea. Recommend posture, crushed-med policy verification, and observation cues. No new clinical claims beyond the data.",
      documentation_gap_check:
        "Compare each active (non-PRN) medication's scheduled_times against the last 30 days of emar_logs. List doses that look undocumented or marked 'missed' and group by medication. Be precise; do not guess motive.",
    };

    const res = await gatewayFetch({
      model: "bedrock",
      messages: [
        {
          role: "system",
          content:
            "You are Nectar, an advisory assistant for a Utah DSPD provider's eMAR. Output is a DRAFT for human review — never assert a clinical fact not supported by the data. Be concise, use bullet points, cite timestamps. Never use the word 'administered' on its own; this Person self-administers with staff support.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Person: ${personName}` },
            { type: "text", text: promptByKind[data.kind] },
            { type: "text", text: `DATA:\n${factualContext}` },
          ],
        },
      ],
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Lovable AI.");
      throw new Error(`AI gateway error: ${res.status} ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const content = j.choices?.[0]?.message?.content ?? "(no response)";
    return { content: String(content) };
  });
