// A6-pre: shared email send rail via Resend REST API.
//
// SECURITY:
// - verify_jwt = true (see supabase/config.toml). Anon callers are rejected
//   before this handler runs; we double-check the Authorization header.
// - This function does NOT enforce per-org permissions — that is the
//   server fn caller's job (see src/lib/email.functions.ts). It simply
//   performs the send if RESEND_API_KEY is configured.
// - No HTML in error responses, no PII echoed back.
//
// FROM (Apex / main contract):
// - This function does NOT read RESEND_FROM. It sends the `from` field
//   from the invoke body. App/Lambda server fns compose that via
//   managedFromAddress() (RESEND_FROM / EMAIL_FROM, else
//   noreply@providerinterface.com).
// - Sandbox @resend.dev in the body is rewritten to the default mailbox
//   so a leftover PR-261-era From cannot hit Resend.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_MANAGED_FROM_ADDRESS = "noreply@providerinterface.com";
const DEFAULT_MANAGED_FROM_NAME = "Provider Interface";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractEmailAddress(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const angled = trimmed.match(/<([^>]+)>/);
  const candidate = (angled?.[1] ?? trimmed).trim();
  if (!candidate.includes("@") || candidate.includes(" ")) return undefined;
  if (candidate.toLowerCase().endsWith("@resend.dev")) return undefined;
  return candidate;
}

function extractDisplayName(raw: string): string | undefined {
  const trimmed = raw.trim();
  const angled = trimmed.match(/^(.+?)\s*<[^>]+>\s*$/);
  if (!angled?.[1]) return undefined;
  const name = angled[1].trim().replace(/^["']|["']$/g, "").trim();
  return name || undefined;
}

/** Use invoke-body From. Rewrite only a missing/sandbox mailbox. */
function resolveFromHeader(bodyFrom: string): string | null {
  const display = extractDisplayName(bodyFrom) || DEFAULT_MANAGED_FROM_NAME;
  const mailbox = extractEmailAddress(bodyFrom) ?? DEFAULT_MANAGED_FROM_ADDRESS;
  return `${display} <${mailbox}>`;
}

type SendBody = {
  from: string;            // "Name <addr@domain>" from the app server fn
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

    const { from: bodyFrom, to, subject, html, text, reply_to, cc, bcc } = body;
    if (typeof bodyFrom !== "string" || !bodyFrom.includes("@")) {
      return json({ error: "Missing/invalid 'from'" }, 400);
    }
    const from = resolveFromHeader(bodyFrom);
    if (!from) return json({ error: "Missing/invalid 'from'" }, 400);
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
      const rawMsg =
        (parsed && typeof parsed === "object" && "message" in (parsed as Record<string, unknown>))
          ? String((parsed as Record<string, unknown>).message)
          : `Resend error ${resp.status}`;
      const errMsg = /not verified|invalid `?from`?/i.test(rawMsg)
        ? "The From domain isn't verified in Resend. Verify providerinterface.com, or set app RESEND_FROM to a verified mailbox."
        : rawMsg;
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
