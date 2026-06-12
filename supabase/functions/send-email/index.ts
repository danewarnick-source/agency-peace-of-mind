// A6-pre: shared email send rail via Resend REST API.
//
// SECURITY:
// - verify_jwt = true (see supabase/config.toml). Anon callers are rejected
//   before this handler runs; we double-check the Authorization header.
// - This function does NOT enforce per-org permissions — that is the
//   server fn caller's job (see src/lib/email.functions.ts). It simply
//   performs the send if RESEND_API_KEY is configured.
// - No HTML in error responses, no PII echoed back.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SendBody = {
  from: string;            // "Name <addr@domain>"
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return json({ error: "RESEND_API_KEY not configured" }, 500);
    }

    const body = (await req.json().catch(() => null)) as SendBody | null;
    if (!body || typeof body !== "object") return json({ error: "Invalid JSON body" }, 400);

    const { from, to, subject, html, text, reply_to, cc, bcc } = body;
    if (typeof from !== "string" || !from.includes("@")) return json({ error: "Missing/invalid 'from'" }, 400);
    if (!to || (typeof to !== "string" && !Array.isArray(to))) return json({ error: "Missing 'to'" }, 400);
    if (typeof subject !== "string" || !subject.trim()) return json({ error: "Missing 'subject'" }, 400);
    if (!html && !text) return json({ error: "Missing 'html' or 'text'" }, 400);

    const payload: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
    };
    if (html) payload.html = html;
    if (text) payload.text = text;
    if (reply_to) payload.reply_to = reply_to;
    if (cc) payload.cc = cc;
    if (bcc) payload.bcc = bcc;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const respText = await resp.text();
    let parsed: unknown;
    try { parsed = JSON.parse(respText); } catch { parsed = { raw: respText }; }

    if (!resp.ok) {
      const errMsg =
        (parsed && typeof parsed === "object" && "message" in (parsed as Record<string, unknown>))
          ? String((parsed as Record<string, unknown>).message)
          : `Resend error ${resp.status}`;
      console.error("[send-email] Resend failure", resp.status, errMsg);
      return json({ ok: false, error: errMsg, status: resp.status }, 502);
    }

    const id =
      (parsed && typeof parsed === "object" && "id" in (parsed as Record<string, unknown>))
        ? String((parsed as Record<string, unknown>).id)
        : null;

    return json({ ok: true, id });
  } catch (e) {
    console.error("[send-email] unhandled", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
