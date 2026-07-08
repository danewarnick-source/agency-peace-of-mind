// Detect effective-date candidates from an uploaded document via NECTAR (Bedrock).
//
// Pass 2 of document effective-dating. The provider still owns and confirms
// the final dates — this endpoint proposes candidates plus a source snippet
// and confidence, never auto-applies.
//
// Input:  { kind: "client"|"employee"|"nectar", document_id: uuid, organization_id: uuid }
// Output: { detected: bool, effective_from, effective_to, effective_to_mode,
//           confidence: "low"|"medium"|"high", source_snippet }
//
// Auth: verify_jwt=true. Caller must be authenticated; org membership is
// re-checked here via service-role query against organization_members.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

type Kind = "client" | "employee" | "nectar";

const TABLE: Record<Kind, string> = {
  client: "client_documents",
  employee: "employee_documents",
  nectar: "nectar_documents",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function empty() {
  return {
    detected: false as const,
    effective_from: null,
    effective_to: null,
    effective_to_mode: null,
    confidence: "low" as const,
    source_snippet: null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Not configured" }, 500);

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind as Kind;
    const documentId = body?.document_id as string;
    const orgId = body?.organization_id as string;
    if (!kind || !TABLE[kind] || !documentId || !orgId) {
      return json({ error: "Invalid input" }, 400);
    }

    // Verify caller via user client
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user?.id) return json({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: mem } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mem) return json({ error: "Forbidden" }, 403);

    // Load the doc row.
    let bucket = "";
    let path = "";
    let mime: string | null = null;
    let rawText: string | null = null;

    if (kind === "client") {
      const { data, error } = await admin
        .from("client_documents")
        .select("storage_path, file_name")
        .eq("id", documentId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error || !data?.storage_path) return json(empty());
      bucket = "client-documents";
      path = data.storage_path as string;
      mime = guessMime(data.file_name as string | null);
    } else if (kind === "employee") {
      const { data, error } = await admin
        .from("employee_documents")
        .select("file_path, mime_type, file_name")
        .eq("id", documentId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error || !data?.file_path) return json(empty());
      bucket = "employee-docs";
      path = data.file_path as string;
      mime = (data.mime_type as string | null) ?? guessMime(data.file_name as string | null);
    } else {
      const { data, error } = await admin
        .from("nectar_documents")
        .select("storage_bucket, storage_path, mime_type, file_name, raw_text")
        .eq("id", documentId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error || !data) return json(empty());
      bucket = data.storage_bucket as string;
      path = data.storage_path as string;
      mime = (data.mime_type as string | null) ?? guessMime(data.file_name as string | null);
      rawText = (data.raw_text as string | null) ?? null;
    }

    // Build message content.
    const userContent: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    > = [];
    userContent.push({
      type: "text",
      text:
        "Find the document's EFFECTIVE-DATE information. Look for phrases like " +
        "'effective from/to', 'plan period', 'coverage period', 'valid from/until', " +
        "annual ranges (e.g. 7/1/2025 – 6/30/2026), expiration dates on certifications " +
        "or insurance, or start/end dates on care plans / authorizations. " +
        "Return dates ONLY if you can quote them from the text. Never guess.",
    });

    if (rawText && rawText.trim().length > 0) {
      userContent.push({ type: "text", text: `--- DOCUMENT TEXT ---\n${rawText.slice(0, MAX_TEXT_CHARS)}` });
    } else {
      const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(path);
      if (dlErr || !blob) return json(empty());
      const ab = await blob.arrayBuffer();
      if (ab.byteLength > MAX_BYTES) return json(empty());
      const ct = mime || blob.type || "";
      if (ct.startsWith("image/")) {
        const buf = new Uint8Array(ab);
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        const dataUrl = `data:${ct};base64,${btoa(bin)}`;
        userContent.push({ type: "image_url", image_url: { url: dataUrl } });
      } else if (ct.startsWith("text/") || ct === "application/json" || ct === "") {
        const decoded = new TextDecoder().decode(ab).slice(0, MAX_TEXT_CHARS);
        if (!decoded.trim()) return json(empty());
        userContent.push({ type: "text", text: `--- DOCUMENT TEXT ---\n${decoded}` });
      } else {
        // Binary (PDF etc.) with no pre-parsed raw_text — nothing to read.
        return json(empty());
      }
    }

    const { gatewayFetch } = await import("../_shared/bedrock-fetch.ts");
    const aiRes = await gatewayFetch({
      messages: [
        {
          role: "system",
          content:
            "You are NECTAR, an advisory compliance assistant for a Utah DSPD provider. " +
            "You extract effective-date candidates from documents. " +
            "Only return dates you can read verbatim from the source. " +
            "If no dates are present, set detected=false. Do not fabricate.",
        },
        { role: "user", content: userContent },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_effective_dates",
            description: "Return effective-date candidates extracted from the document.",
            parameters: {
              type: "object",
              properties: {
                detected: { type: "boolean", description: "True only if a clearly-stated effective date was found." },
                effective_from: { type: "string", description: "YYYY-MM-DD start date if stated." },
                effective_to: { type: "string", description: "YYYY-MM-DD end date if stated." },
                effective_to_mode: {
                  type: "string",
                  enum: ["fixed_date", "ongoing", "until_replaced"],
                  description: "fixed_date when there's a real end date; ongoing/until_replaced only if the document says so.",
                },
                confidence: { type: "string", enum: ["low", "medium", "high"] },
                source_snippet: {
                  type: "string",
                  description: "A short quote (<=240 chars) from the document that contains the dates.",
                },
              },
              required: ["detected"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_effective_dates" } },
      max_tokens: 500,
      temperature: 0.0,
    });

    if (!aiRes.ok) {
      console.error("detect-doc-dates ai error", aiRes.status, await aiRes.text());
      return json(empty());
    }
    const j = (await aiRes.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json(empty());
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(args); } catch { return json(empty()); }

    const detected = parsed.detected === true;
    const from = normDate(parsed.effective_from);
    const to = normDate(parsed.effective_to);
    if (!detected || !from) return json(empty());

    return json({
      detected: true,
      effective_from: from,
      effective_to: to,
      effective_to_mode: (parsed.effective_to_mode as string | null) ?? (to ? "fixed_date" : "until_replaced"),
      confidence: (parsed.confidence as string | null) ?? "medium",
      source_snippet: typeof parsed.source_snippet === "string" ? String(parsed.source_snippet).slice(0, 240) : null,
    });
  } catch (e) {
    console.error("detect-doc-dates error", e);
    return json(empty());
  }
});

function normDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function guessMime(name: string | null): string | null {
  if (!name) return null;
  const ext = name.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "txt": return "text/plain";
    case "md": return "text/markdown";
    case "json": return "application/json";
    default: return null;
  }
}
