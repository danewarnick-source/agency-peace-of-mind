// NECTAR meal suggestions — assistive, never authoritative.
// Given the week's meals + client dietary needs/allergies + optional budget context,
// suggest healthier / more affordable swaps. Manager decides.
// Never returns an ingredient the client is allergic to.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type MealCtx = { day: string; slot: string; label: string; estimated_cost?: number | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const body = await req.json().catch(() => ({}));
    const meals: MealCtx[] = Array.isArray(body?.meals) ? body.meals.slice(0, 40) : [];
    const dietaryNeeds: string = typeof body?.dietary_needs === "string" ? body.dietary_needs : "";
    const allergies: string[] = Array.isArray(body?.allergies) ? body.allergies : [];
    const foodsToAvoid: string = typeof body?.foods_to_avoid === "string" ? body.foods_to_avoid : "";
    const budgetRemaining: number | null =
      typeof body?.budget_remaining === "number" ? body.budget_remaining : null;
    const goal: string = typeof body?.goal === "string" ? body.goal : "healthier_and_affordable";

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
      messages: [
        {
          role: "system",
          content:
            "You are NECTAR's meal-planning suggestion assistant for a Utah DSPD disability-services provider. " +
            "You SUGGEST healthier and/or more affordable meal swaps that respect the client's dietary needs and allergies. " +
            "Allergies are HARD AVOIDS — never suggest an ingredient the client is allergic to. " +
            "Suggestions are advisory. The manager decides. Do not invent prices; if you can't estimate, omit the price. " +
            "Keep each rationale to one short sentence.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `Client dietary needs: ${dietaryNeeds || "(none stated)"}\n` +
                `Allergies (hard avoids): ${allergies.length ? allergies.join(", ") : "(none stated)"}\n` +
                `Foods to avoid this week: ${foodsToAvoid || "(none stated)"}\n` +
                `Weekly food budget remaining: ${
                  budgetRemaining !== null ? `$${budgetRemaining.toFixed(2)}` : "(unknown)"
                }\n` +
                `Goal: ${goal}\n\n` +
                `Current planned meals:\n${meals
                  .map(
                    (m) =>
                      `- ${m.day} ${m.slot}: ${m.label || "(unnamed)"}${
                        m.estimated_cost != null ? ` (est $${m.estimated_cost})` : ""
                      }`,
                  )
                  .join("\n") || "(none)"}`,
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_suggestions",
            description: "Return meal-swap suggestions.",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      swap_for: { type: "string", description: "The planned meal to potentially swap (day + slot + label), or 'new' for an added meal." },
                      suggested_meal: { type: "string" },
                      rationale: { type: "string" },
                      estimated_cost: { type: "number" },
                      kind: {
                        type: "string",
                        enum: ["healthier", "cheaper", "both", "allergy_conflict"],
                      },
                    },
                    required: ["suggested_meal", "rationale", "kind"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_suggestions" } },
      max_tokens: 1500,
      temperature: 0.3,
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("nectar meal suggest error", aiRes.status, t);
      return json({ error: "Suggestions unavailable", detail: t.slice(0, 400) }, aiRes.status === 429 ? 429 : 502);
    }
    const j = (await aiRes.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : { suggestions: [] };
    return json(parsed);
  } catch (e) {
    console.error("suggest-meal-swaps error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
