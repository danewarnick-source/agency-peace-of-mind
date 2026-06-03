// Receipt OCR via Lovable AI Gateway (vision)
// Accepts { bucket: string, path: string }  -- preferred; resolved server-side via storage
//      OR { imageBase64: string, mime?: string }  -- inline data
// Returns { merchant_name, total_amount, transaction_date }
//
// SECURITY:
// - verify_jwt = true in supabase/config.toml: unauthenticated callers are rejected before this code runs.
// - We do NOT accept a caller-supplied URL. Previously this function fetched an arbitrary `imageUrl`,
//   which was a Server-Side Request Forgery (SSRF) hole (e.g. http://169.254.169.254 cloud metadata).
//   Instead, callers pass a storage bucket+path and we download via the service-role client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Buckets the OCR function is allowed to read from. Anything else is rejected.
const ALLOWED_BUCKETS = new Set([
  "client_receipt_snapshots",
  "client-spending-receipts",
  "activity-receipts",
]);

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Defense-in-depth: verify_jwt=true already enforces this, but require the
    // authorization header explicitly so any misconfiguration fails closed.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { bucket, path, imageBase64, mime } = body ?? {};

    let dataUrl: string | undefined;

    if (typeof imageBase64 === "string" && imageBase64.length > 0) {
      // Inline base64 — no network fetch, no SSRF risk.
      const safeMime = typeof mime === "string" && /^image\/[a-zA-Z0-9.+-]+$/.test(mime) ? mime : "image/jpeg";
      dataUrl = `data:${safeMime};base64,${imageBase64}`;
    } else if (typeof bucket === "string" && typeof path === "string") {
      if (!ALLOWED_BUCKETS.has(bucket)) {
        return json({ error: "Bucket not allowed" }, 400);
      }
      // Reject any path traversal / absolute URL trickery.
      if (
        path.length === 0 ||
        path.length > 1024 ||
        path.includes("..") ||
        path.startsWith("/") ||
        /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path)
      ) {
        return json({ error: "Invalid path" }, 400);
      }

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Storage not configured");

      const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
      const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(path);
      if (dlErr || !blob) {
        return json({ error: `Failed to read receipt: ${dlErr?.message ?? "not found"}` }, 400);
      }
      const ab = await blob.arrayBuffer();
      if (ab.byteLength > MAX_IMAGE_BYTES) {
        return json({ error: "Image too large" }, 413);
      }
      const ct = (blob.type && /^image\//.test(blob.type)) ? blob.type : "image/jpeg";
      const buf = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      dataUrl = `data:${ct};base64,${btoa(bin)}`;
    } else {
      return json({ error: "Provide { bucket, path } or { imageBase64 }" }, 400);
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
        return json({ error: "Rate limit exceeded, try again shortly." }, 429);
      }
      if (aiRes.status === 402) {
        return json({ error: "AI credits exhausted. Add funds in Lovable AI workspace." }, 402);
      }
      return json({ error: "AI gateway error" }, 500);
    }

    const j = await aiRes.json();
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : null;
    if (!args) throw new Error("AI did not return structured receipt data");

    return json(args, 200);
  } catch (e) {
    console.error("parse-receipt-ocr error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
