// Recipe → structured meal via NECTAR (AWS Bedrock).
// Accepts { text } (pasted recipe) or { imageBase64, mimeType } (photo/scan).
// Returns { meal_name, ingredients: [{item, quantity}] }.
// Never fabricates: sparse output preferred over guesses.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_TEXT_CHARS = 30_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { text, imageBase64, mimeType } = body ?? {};

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    userContent.push({
      type: "text",
      text:
        "Extract the recipe name and ingredient list from this recipe. " +
        "For each ingredient, capture the item name and the quantity as written (e.g. '2 cups', '1 lb', '3'). " +
        "If a quantity is not stated, leave it blank. " +
        "Do NOT invent ingredients or quantities. Prefer sparse output over guesses.",
    });

    if (typeof text === "string" && text.trim().length > 0) {
      userContent.push({
        type: "text",
        text: `--- RECIPE TEXT ---\n${text.slice(0, MAX_TEXT_CHARS)}`,
      });
    } else if (typeof imageBase64 === "string" && typeof mimeType === "string") {
      // rough size check on base64 payload
      const approxBytes = Math.ceil((imageBase64.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) return json({ error: "Image too large" }, 413);
      if (!mimeType.startsWith("image/")) return json({ error: "Unsupported media" }, 415);
      const dataUrl = `data:${mimeType};base64,${imageBase64}`;
      userContent.push({ type: "image_url", image_url: { url: dataUrl } });
    } else {
      return json({ error: "Provide { text } or { imageBase64, mimeType }" }, 400);
    }

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
      messages: [
        {
          role: "system",
          content:
            "You are NECTAR's recipe parsing assistant for a Utah DSPD disability-services provider. " +
            "You read recipes (pasted text, scanned photos, cookbook screenshots) and return ONLY " +
            "the structured meal name and ingredient list you can read directly. Never invent " +
            "ingredients, quantities, or steps. Output exactly one function call.",
        },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_recipe",
            description: "Return the recipe name and ingredient list readable from the source.",
            parameters: {
              type: "object",
              properties: {
                meal_name: {
                  type: "string",
                  description: "Name/title of the recipe as written.",
                },
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      item: { type: "string", description: "Ingredient name (e.g. 'spaghetti', 'ground beef')." },
                      quantity: { type: "string", description: "Amount as written (e.g. '1 lb', '2 cups'). Empty if not stated." },
                    },
                    required: ["item"],
                    additionalProperties: false,
                  },
                },
                notes: { type: "string", description: "Any extra prep note worth preserving verbatim." },
              },
              required: ["meal_name", "ingredients"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_recipe" } },
      max_tokens: 2000,
      temperature: 0.1,
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("nectar recipe parse error", aiRes.status, t);
      return json({ error: "Parser unavailable", detail: t.slice(0, 400) }, aiRes.status === 429 ? 429 : 502);
    }

    const j = (await aiRes.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const parsed = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
    return json({
      meal_name: parsed.meal_name ?? "",
      ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
      notes: parsed.notes ?? null,
    });
  } catch (e) {
    console.error("parse-recipe-doc error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
