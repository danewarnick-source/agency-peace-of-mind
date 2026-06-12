/**
 * Gmail ingest cron hook (pg_cron → every 5 min).
 *
 * Auth: shared NECTAR_CRON_SECRET (same pattern as other public hooks).
 *
 * Per connection:
 *  1. refresh token if expired
 *  2. build Gmail q from rules
 *  3. list messages received after last_polled_at
 *  4. for each new message:
 *       - skip if already in gmail_ingested_messages (UNIQUE)
 *       - fetch full message, extract body text
 *       - download PDF attachments to referral-documents bucket
 *       - call parse-referral-doc on body + each attachment, pick richest result
 *       - insert referral draft (source='email', status='new', stage='new')
 *       - insert linked referral_documents rows
 *       - upsert gmail_ingested_messages
 *       - audit row
 *  5. update last_polled_at, history snapshot
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

function verifyCronSecret(request: Request): boolean {
  const expected = process.env.NECTAR_CRON_SECRET;
  if (!expected) return false;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const MAX_MESSAGES_PER_CONN = 15;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function b64urlToText(s: string): string {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64").toString("utf8");
}
function b64urlToBuffer(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

function walkParts(part: GmailPart, out: { text: string[]; attachments: GmailPart[] }): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push(part);
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.text.push(b64urlToText(part.body.data));
  } else if (part.mimeType === "text/html" && part.body?.data && out.text.length === 0) {
    // crude HTML→text fallback; only used if no text/plain part
    out.text.push(b64urlToText(part.body.data).replace(/<[^>]+>/g, " "));
  }
  if (part.parts) for (const p of part.parts) walkParts(p, out);
}

function getHeader(headers: Array<{ name: string; value: string }> | undefined, name: string): string {
  return (headers ?? []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function extractFromEmail(fromHeader: string): string {
  const m = fromHeader.match(/<([^>]+)>/);
  return (m ? m[1] : fromHeader).trim().toLowerCase();
}

function ruleMatchesQuery(rule: {
  sender_domains: string[];
  sender_emails: string[];
  subject_contains: string[];
}): string {
  const parts: string[] = [];
  const froms: string[] = [];
  for (const e of rule.sender_emails ?? []) froms.push(`from:${e}`);
  for (const d of rule.sender_domains ?? []) froms.push(`from:${d}`);
  if (froms.length) parts.push(`(${froms.join(" OR ")})`);
  if (rule.subject_contains?.length) {
    const subs = rule.subject_contains.map((s) => `subject:"${s.replace(/"/g, "")}"`);
    parts.push(`(${subs.join(" OR ")})`);
  }
  return parts.join(" ");
}

type ReferralPrefill = Record<string, unknown> & {
  first_name?: string;
  age?: number;
  gender?: string;
  date_of_birth?: string;
  location_city?: string;
  location_county?: string;
  disability_types?: string[];
  disability_level?: string;
  requested_codes?: string[];
  budget_note?: string;
  need_level?: string;
  description?: string;
  category?: "direct_support" | "rhs" | "hhs";
  support_coordinator_name?: string;
  support_coordinator_email?: string;
  support_coordinator_phone?: string;
  due_date?: string;
  notes?: string;
};

function fieldRichness(f: ReferralPrefill): number {
  return Object.values(f).filter((v) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}

async function callParser(payload: { text?: string } | { bucket: string; path: string }): Promise<ReferralPrefill> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE) return {};
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-referral-doc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return {};
    const body = (await res.json().catch(() => ({}))) as { fields?: ReferralPrefill };
    return body.fields ?? {};
  } catch {
    return {};
  }
}

async function processConnection(connection: {
  id: string;
  organization_id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  last_polled_at: string | null;
}): Promise<{ processed: number; created: number; errors: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { refreshAccessToken } = await import("@/lib/gmail-oauth.server");

  let accessToken = connection.access_token;
  const isExpired = !connection.token_expires_at || new Date(connection.token_expires_at).getTime() < Date.now();

  if (isExpired) {
    if (!connection.refresh_token) {
      await supabaseAdmin
        .from("gmail_connections")
        .update({ status: "error", last_error: "No refresh token — reconnect required" })
        .eq("id", connection.id);
      return { processed: 0, created: 0, errors: 1 };
    }
    try {
      const t = await refreshAccessToken(connection.refresh_token);
      accessToken = t.access_token;
      await supabaseAdmin
        .from("gmail_connections")
        .update({
          access_token: t.access_token,
          token_expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
          status: "active",
          last_error: null,
        })
        .eq("id", connection.id);
    } catch (e) {
      await supabaseAdmin
        .from("gmail_connections")
        .update({ status: "error", last_error: (e as Error).message.slice(0, 500) })
        .eq("id", connection.id);
      return { processed: 0, created: 0, errors: 1 };
    }
  }
  if (!accessToken) return { processed: 0, created: 0, errors: 1 };

  // Load rules
  const { data: rules } = await supabaseAdmin
    .from("gmail_ingestion_rules")
    .select("rule_name, sender_domains, sender_emails, subject_contains, enabled")
    .eq("organization_id", connection.organization_id)
    .eq("enabled", true);

  if (!rules || rules.length === 0) {
    await supabaseAdmin
      .from("gmail_connections")
      .update({ last_polled_at: new Date().toISOString() })
      .eq("id", connection.id);
    return { processed: 0, created: 0, errors: 0 };
  }

  // Build query: union of all rule clauses, plus an `after:` date window
  const sinceEpoch = Math.floor(
    (connection.last_polled_at ? new Date(connection.last_polled_at).getTime() : Date.now() - 24 * 60 * 60 * 1000) / 1000,
  );
  const ruleQueries = rules.map(ruleMatchesQuery).filter(Boolean);
  if (ruleQueries.length === 0) {
    await supabaseAdmin
      .from("gmail_connections")
      .update({ last_polled_at: new Date().toISOString() })
      .eq("id", connection.id);
    return { processed: 0, created: 0, errors: 0 };
  }
  const q = `(${ruleQueries.join(" OR ")}) after:${sinceEpoch} -in:trash -in:spam`;

  const listRes = await fetch(
    `${GMAIL_API}/messages?maxResults=${MAX_MESSAGES_PER_CONN}&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!listRes.ok) {
    const txt = await listRes.text().catch(() => "");
    await supabaseAdmin
      .from("gmail_connections")
      .update({ status: "error", last_error: `list failed (${listRes.status}): ${txt.slice(0, 300)}` })
      .eq("id", connection.id);
    return { processed: 0, created: 0, errors: 1 };
  }
  const listBody = (await listRes.json()) as { messages?: Array<{ id: string; threadId: string }> };
  const messages = listBody.messages ?? [];

  let processed = 0;
  let created = 0;
  let errors = 0;

  for (const m of messages) {
    processed++;
    // dedup
    const { data: existing } = await supabaseAdmin
      .from("gmail_ingested_messages")
      .select("id")
      .eq("organization_id", connection.organization_id)
      .eq("gmail_message_id", m.id)
      .maybeSingle();
    if (existing) continue;

    try {
      const detailRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detailRes.ok) {
        await supabaseAdmin.from("gmail_ingested_messages").insert({
          organization_id: connection.organization_id,
          gmail_message_id: m.id,
          gmail_thread_id: m.threadId,
          outcome: "error",
          error_message: `fetch ${detailRes.status}`,
        });
        errors++;
        continue;
      }
      const detail = (await detailRes.json()) as {
        internalDate?: string;
        payload?: GmailPart & { headers?: Array<{ name: string; value: string }> };
      };
      const headers = detail.payload?.headers;
      const fromEmail = extractFromEmail(getHeader(headers, "From"));
      const subject = getHeader(headers, "Subject");
      const internalDate = detail.internalDate ? new Date(Number(detail.internalDate)).toISOString() : null;

      const walked = { text: [] as string[], attachments: [] as GmailPart[] };
      if (detail.payload) walkParts(detail.payload, walked);
      const bodyText = walked.text.join("\n\n").slice(0, 60000);

      // Parse body first
      let best: ReferralPrefill = bodyText ? await callParser({ text: bodyText }) : {};
      const uploadedDocs: Array<{ path: string; file_name: string; mime_type: string }> = [];

      // Parse PDF attachments; pick richest
      for (const att of walked.attachments) {
        if (!att.body?.attachmentId) continue;
        const mime = (att.mimeType ?? "").toLowerCase();
        if (!mime.includes("pdf") && !/\.(pdf)$/i.test(att.filename ?? "")) continue;
        if ((att.body.size ?? 0) > MAX_ATTACHMENT_BYTES) continue;

        const attRes = await fetch(`${GMAIL_API}/messages/${m.id}/attachments/${att.body.attachmentId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!attRes.ok) continue;
        const attJson = (await attRes.json()) as { data?: string };
        if (!attJson.data) continue;
        const fileBytes = b64urlToBuffer(attJson.data);
        if (fileBytes.byteLength > MAX_ATTACHMENT_BYTES) continue;

        const safeName = (att.filename ?? "attachment.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${connection.organization_id}/gmail/${m.id}-${safeName}`;
        const up = await supabaseAdmin.storage
          .from("referral-documents")
          .upload(path, fileBytes, { contentType: mime || "application/pdf", upsert: true });
        if (up.error) continue;
        uploadedDocs.push({ path, file_name: safeName, mime_type: mime || "application/pdf" });

        const parsed = await callParser({ bucket: "referral-documents", path });
        if (fieldRichness(parsed) > fieldRichness(best)) best = parsed;
      }

      // Try to match SC by sender email
      let scId: string | null = null;
      if (fromEmail) {
        const { data: sc } = await supabaseAdmin
          .from("support_coordinators")
          .select("id")
          .eq("organization_id", connection.organization_id)
          .ilike("email", fromEmail)
          .maybeSingle();
        if (sc) scId = sc.id;
      }

      const firstName = (best.first_name as string) || (subject ? subject.slice(0, 80) : "Referral (review)");

      const insertPayload = {
        organization_id: connection.organization_id,
        first_name: firstName,
        age: (best.age as number) ?? null,
        gender: (best.gender as string) ?? null,
        date_of_birth: (best.date_of_birth as string) ?? null,
        location_city: (best.location_city as string) ?? null,
        location_county: (best.location_county as string) ?? null,
        disability_types: (best.disability_types as string[]) ?? [],
        disability_level: (best.disability_level as string) ?? null,
        requested_codes: (best.requested_codes as string[]) ?? [],
        budget_note: (best.budget_note as string) ?? null,
        need_level: (best.need_level as string) ?? null,
        description: (best.description as string) ?? null,
        category: (best.category as string) ?? null,
        due_date: (best.due_date as string) ?? null,
        notes: [best.notes as string | undefined, `Auto-ingested from email: ${subject || "(no subject)"}\nFrom: ${fromEmail}`]
          .filter(Boolean)
          .join("\n\n"),
        source: "email" as const,
        status: "new" as const,
        stage: "new" as const,
        support_coordinator_id: scId,
      };

      const { data: ref, error: refErr } = await supabaseAdmin
        .from("referrals")
        .insert(insertPayload)
        .select("id")
        .single();
      if (refErr || !ref) {
        await supabaseAdmin.from("gmail_ingested_messages").insert({
          organization_id: connection.organization_id,
          gmail_message_id: m.id,
          gmail_thread_id: m.threadId,
          from_email: fromEmail,
          subject,
          internal_date: internalDate,
          outcome: "error",
          error_message: refErr?.message ?? "insert failed",
        });
        errors++;
        continue;
      }

      // Link attachments
      if (uploadedDocs.length) {
        await supabaseAdmin.from("referral_documents").insert(
          uploadedDocs.map((d) => ({
            organization_id: connection.organization_id,
            referral_id: ref.id,
            storage_bucket: "referral-documents",
            storage_path: d.path,
            file_name: d.file_name,
            mime_type: d.mime_type,
            parse_status: "parsed",
          })),
        );
      }

      await supabaseAdmin.from("gmail_ingested_messages").insert({
        organization_id: connection.organization_id,
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        from_email: fromEmail,
        subject,
        internal_date: internalDate,
        referral_id: ref.id,
        outcome: "created",
      });

      await supabaseAdmin.from("gmail_ingestion_audit").insert({
        organization_id: connection.organization_id,
        actor_kind: "system_cron",
        action: "ingest_message",
        gmail_message_id: m.id,
        referral_id: ref.id,
        detail: {
          from: fromEmail,
          subject,
          attachments: uploadedDocs.length,
          field_count: fieldRichness(best),
        },
      });

      created++;
    } catch (e) {
      errors++;
      await supabaseAdmin.from("gmail_ingested_messages").insert({
        organization_id: connection.organization_id,
        gmail_message_id: m.id,
        gmail_thread_id: m.threadId,
        outcome: "error",
        error_message: (e as Error).message.slice(0, 500),
      });
    }
  }

  await supabaseAdmin
    .from("gmail_connections")
    .update({ last_polled_at: new Date().toISOString(), last_error: null })
    .eq("id", connection.id);

  return { processed, created, errors };
}

export const Route = createFileRoute("/api/public/hooks/gmail-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!verifyCronSecret(request)) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: conns } = await supabaseAdmin
          .from("gmail_connections")
          .select("id, organization_id, access_token, refresh_token, token_expires_at, last_polled_at")
          .eq("status", "active")
          .limit(50);

        const results: Array<{ org: string; processed: number; created: number; errors: number }> = [];
        for (const c of conns ?? []) {
          const r = await processConnection(c);
          results.push({ org: c.organization_id, ...r });
        }
        return new Response(JSON.stringify({ ok: true, results }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
