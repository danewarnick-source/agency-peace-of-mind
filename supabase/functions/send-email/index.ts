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
// FROM:
// - Mailbox comes from RESEND_FROM / EMAIL_FROM on this function (same
//   rule as auth-send-email and src/lib/managed-from.ts), then a valid
//   address in the request body, then noreply@providerinterface.com.
// - Never send from @resend.dev. Display name stays the caller's
//   "Name <addr>" prefix (org name) when present.

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

/** Mailbox: function secret first, then a valid body address, then default. */
function resolveMailbox(bodyFrom: string): string {
  const envRaw = (Deno.env.get("RESEND_FROM") ?? Deno.env.get("EMAIL_FROM") ?? "").trim();
  return extractEmailAddress(envRaw) ?? extractEmailAddress(bodyFrom) ?? DEFAULT_MANAGED_FROM_ADDRESS;
}

function resolveFromHeader(bodyFrom: string): string {
  const display = extractDisplayName(bodyFrom) || DEFAULT_MANAGED_FROM_NAME;
  return `${display} <${resolveMailbox(bodyFrom)}>`;
}

type SendBody = {
  from?: string;            // "Name <addr@domain>" — display name kept; mailbox may be replaced
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

    const { to, subject, html, text, reply_to, cc, bcc } = body;
    const bodyFrom = typeof body.from === "string" ? body.from : "";
    const from = resolveFromHeader(bodyFrom);
    if (!from.includes("@")) return json({ error: "Missing/invalid 'from'" }, 400);
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
        ? "The From domain isn't verified in Resend. Verify providerinterface.com, or set RESEND_FROM to a verified mailbox."
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
