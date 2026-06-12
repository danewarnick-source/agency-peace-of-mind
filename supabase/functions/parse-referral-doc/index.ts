// Referral document → structured pre-fill via NECTAR (AWS Bedrock).
// Reuses the shared gatewayFetch shim used by parse-receipt-ocr.
//
// SECURITY:
// - verify_jwt = true (see supabase/config.toml) — anon callers rejected before code runs.
// - Caller-supplied URL not accepted. Callers pass either:
//     { bucket, path }   — service-role download from an allowed bucket
//     { text }           — pasted email/forwarded text (no fetch)
// - Caller (server fn) is responsible for verifying the user has manage_referrals.
//
// Output: { fields, rawText? } where fields is a partial referral pre-fill object.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_BUCKETS = new Set(["referral-documents"]);
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

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
    const { bucket, path, text } = body ?? {};

    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];

    userContent.push({
      type: "text",
      text:
        "Extract structured intake fields from this referral document. " +
        "Return ONLY the fields you can confidently identify; omit anything that's not clearly stated. " +
        "Do NOT guess. Sparse output is preferred over hallucinated values.",
    });

    if (typeof text === "string" && text.trim().length > 0) {
      const clipped = text.slice(0, MAX_TEXT_CHARS);
      userContent.push({ type: "text", text: `--- DOCUMENT TEXT ---\n${clipped}` });
    } else if (typeof bucket === "string" && typeof path === "string") {
      if (!ALLOWED_BUCKETS.has(bucket)) return json({ error: "Bucket not allowed" }, 400);
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
      if (dlErr || !blob) return json({ error: `Read failed: ${dlErr?.message ?? "not found"}` }, 400);
      const ab = await blob.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return json({ error: "File too large" }, 413);

      const ct = blob.type || "";
      if (ct.startsWith("image/")) {
        const buf = new Uint8Array(ab);
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const dataUrl = `data:${ct};base64,${btoa(bin)}`;
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      } else if (ct.startsWith("text/") || ct === "application/json") {
        const decoded = new TextDecoder().decode(ab).slice(0, MAX_TEXT_CHARS);
        userContent.push({ type: "text", text: `--- DOCUMENT TEXT ---\n${decoded}` });
      } else {
        // PDFs and unknown binary types: vision model can't read them directly
        // through the Bedrock Converse image path. Tell the caller so the doc is
        // still stored and linked, just not auto-prefilled.
        return json({
          error: "unsupported_for_parse",
          message:
            "This file type can't be auto-parsed yet (PDF or other). The document is still stored and linked to the referral — please fill the fields manually or paste the text.",
        }, 415);
      }
    } else {
      return json({ error: "Provide { bucket, path } or { text }" }, 400);
    }

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
      messages: [
        {
          role: "system",
          content:
            "You are NECTAR's referral intake assistant for a Utah DSPD disability-services provider. " +
            "You read referral documents (forwarded emails, intake forms, screenshots) and return ONLY structured fields you can read directly from the document. " +
            "Never invent data. Omit any field that isn't clearly stated. Output exactly one function call.",
        },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_referral_fields",
            description: "Return any referral intake fields readable from the document.",
            parameters: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "Client's first name (or first + last initial) as written." },
                age: { type: "integer" },
                gender: { type: "string" },
                date_of_birth: { type: "string", description: "YYYY-MM-DD if explicit." },
                location_city: { type: "string" },
                location_county: { type: "string" },
                disability_types: { type: "array", items: { type: "string" } },
                disability_level: { type: "string" },
                requested_codes: {
                  type: "array",
                  items: { type: "string" },
                  description: "DSPD billing codes like RHS, HHS, DSG, SLN, SLH, DSI, SEI, COM if mentioned.",
                },
                budget_note: { type: "string" },
                need_level: { type: "string" },
                description: { type: "string", description: "1-3 sentence summary of the request / situation." },
                category: {
                  type: "string",
                  enum: ["direct_support", "rhs", "hhs"],
                  description: "Best-guess category ONLY if obvious from the doc.",
                },
                support_coordinator_name: { type: "string" },
                support_coordinator_agency: { type: "string" },
                support_coordinator_email: { type: "string" },
                support_coordinator_phone: { type: "string" },
                due_date: { type: "string", description: "YYYY-MM-DD if explicit." },
                notes: { type: "string", description: "Any extra context worth preserving verbatim." },
              },
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_referral_fields" } },
      max_tokens: 2000,
      temperature: 0.1,
    });

    if (!aiRes.ok) {
      const t = await aiRes.text();
      console.error("nectar parse error", aiRes.status, t);
      return json({ error: "Parser unavailable", detail: t.slice(0, 400) }, aiRes.status === 429 ? 429 : 502);
    }

    const j = await aiRes.json() as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const fields = call?.function?.arguments ? JSON.parse(call.function.arguments) : {};
    return json({ fields }, 200);
  } catch (e) {
    console.error("parse-referral-doc error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
