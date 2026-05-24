// Receipt OCR via Lovable AI Gateway (vision)
// Accepts { imageUrl: string } OR { imageBase64: string, mime?: string }
// Returns { merchant_name, total_amount, transaction_date }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { imageUrl, imageBase64, mime } = await req.json();

    let dataUrl: string | undefined;
    if (imageBase64) {
      dataUrl = `data:${mime || "image/jpeg"};base64,${imageBase64}`;
    } else if (imageUrl) {
      // Fetch the image server-side and convert to base64 (handles signed URLs / private buckets)
      const r = await fetch(imageUrl);
      if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
      const ct = r.headers.get("content-type") || "image/jpeg";
      const buf = new Uint8Array(await r.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      dataUrl = `data:${ct};base64,${btoa(bin)}`;
    } else {
      throw new Error("Provide imageUrl or imageBase64");
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You read retail/medical receipts and extract structured data. Always return the function call exactly once with normalized fields.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract merchant_name, total_amount (final paid total, numeric), and transaction_date (YYYY-MM-DD) from this receipt." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_receipt",
              description: "Return parsed receipt fields.",
              parameters: {
                type: "object",
                properties: {
                  merchant_name: { type: "string" },
                  total_amount: { type: "number" },
                  transaction_date: { type: "string", description: "YYYY-MM-DD" },
                },
                required: ["merchant_name", "total_amount", "transaction_date"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_receipt" } },
      }),
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("AI gateway error", aiRes.status, t);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Lovable AI workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const j = await aiRes.json();
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : null;
    if (!args) throw new Error("AI did not return structured receipt data");

    return new Response(JSON.stringify(args), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt-ocr error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
