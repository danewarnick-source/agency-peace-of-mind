// Nectar — import a schedule from an uploaded file (PDF, image, CSV, or text).
// Returns Draft[] in the same shape as nectarDraftShifts so the existing
// review/apply path can render and commit the rows. Anything Nectar can't
// confidently match comes back with staff_id/client_id null + a flag.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DraftShift = {
  staff_id: string | null;
  staff_label: string | null;
  client_id: string | null;
  client_label: string | null;
  service_code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  notes: string | null;
  flags: string[];
};

const MAX_BYTES = 10 * 1024 * 1024;

export const nectarImportSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    organization_id: string;
    file_name: string;
    file_mime: string;
    file_b64: string;
    week_start_iso: string;
  }) =>
    z.object({
      organization_id: z.string().uuid(),
      file_name: z.string().min(1).max(300),
      file_mime: z.string().min(1).max(200),
      file_b64: z.string().min(8),
      week_start_iso: z.string().min(8),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { supabase } = context as any;

    const approxBytes = Math.floor((data.file_b64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      throw new Error("File is larger than 10 MB. Please upload a smaller file.");
    }

    const [staffRes, clientsRes, authsRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id, profiles:profiles!inner(id, first_name, last_name, full_name)")
        .eq("organization_id", data.organization_id)
        .eq("active", true),
      supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("organization_id", data.organization_id),
      supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from("client_billing_codes" as any)
        .select("client_id, service_code, service_end_date")
        .eq("organization_id", data.organization_id),
    ]);

    type StaffRow = { profiles: { id: string; first_name: string | null; last_name: string | null; full_name: string | null } };
    const staffList = ((staffRes.data ?? []) as unknown as StaffRow[])
      .map((m) => m.profiles)
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        name:
          (p.full_name?.trim()) ||
          [p.first_name, p.last_name].filter(Boolean).join(" ").trim() ||
          "Staff",
      }));
    const clientList = ((clientsRes.data ?? []) as Array<{
      id: string; first_name: string; last_name: string;
    }>).map((c) => ({
      id: c.id,
      name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    }));
    const today = new Date().toISOString().slice(0, 10);
    const authsByClient = new Map<string, Set<string>>();
    for (const a of (authsRes.data ?? []) as Array<{
      client_id: string; service_code: string; service_end_date: string | null;
    }>) {
      if (a.service_end_date && a.service_end_date <= today) continue;
      const set = authsByClient.get(a.client_id) ?? new Set<string>();
      set.add((a.service_code ?? "").toUpperCase());
      authsByClient.set(a.client_id, set);
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("AI gateway not configured.");

    const mime = (data.file_mime || "").toLowerCase();
    const isPdf = mime === "application/pdf" || data.file_name.toLowerCase().endsWith(".pdf");
    const isImage = mime.startsWith("image/");
    const isText =
      mime.startsWith("text/") ||
      mime === "application/json" ||
      mime === "text/csv" ||
      data.file_name.toLowerCase().endsWith(".csv") ||
      data.file_name.toLowerCase().endsWith(".txt");

    const system = `You are Nectar, a scheduling assistant for HIVE.
Output strict JSON with shape: {"drafts": [{"staff_name": string|null, "client_name": string|null, "service_code": string|null, "starts_at": string|null, "ends_at": string|null, "notes": string|null}]}.
Use ISO8601 UTC for starts_at/ends_at. The target week starts on ${data.week_start_iso}.
Extract every shift you can find in the document.
For staff_name and client_name, match strictly to the lists below — if you can't confidently match a name to one of these, return the name as written (so the admin sees it as unmatched) and DO NOT invent.
For service_code, only use codes from the list. Use null if unsure.
Never fabricate shifts that aren't in the document.

STAFF: ${JSON.stringify(staffList.map((s) => s.name))}
CLIENTS: ${JSON.stringify(clientList.map((c) => c.name))}
SERVICE CODES: ["SLH","SLN","COM","PAC","RP2","RP4","RP5","HHS","RHS","DSI","DSG","DSP","SEI","CHA","HSQ","PM1","ACA","CHA","CMP","CMS"]`;

    // Build the user message content. Multimodal for PDF/image, text otherwise.
    type ContentBlock =
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
      | { type: "file"; file: { filename: string; file_data: string } };

    let userContent: string | ContentBlock[];
    if (isPdf) {
      userContent = [
        { type: "text", text: "Extract every shift from this schedule document." },
        {
          type: "file",
          file: {
            filename: data.file_name,
            file_data: `data:application/pdf;base64,${data.file_b64}`,
          },
        },
      ];
    } else if (isImage) {
      userContent = [
        { type: "text", text: "Extract every shift from this schedule image." },
        {
          type: "image_url",
          image_url: { url: `data:${mime};base64,${data.file_b64}` },
        },
      ];
    } else if (isText) {
      let decoded = "";
      try {
        decoded = Buffer.from(data.file_b64, "base64").toString("utf8");
      } catch {
        throw new Error("Couldn't read that file. Try saving it as PDF, CSV, or an image.");
      }
      userContent = `Extract every shift from this schedule text:\n\n${decoded.slice(0, 50_000)}`;
    } else {
      throw new Error(
        "Unsupported file type. Upload a PDF, image, CSV, or text file (Word/Excel: export to PDF or CSV first).",
      );
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "bedrock",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      if (aiRes.status === 402)
        throw new Error("Nectar credits exhausted — add credits in Workspace billing.");
      if (aiRes.status === 429)
        throw new Error("Nectar is rate-limited — try again shortly.");
      throw new Error(`Nectar couldn't read this file: ${txt.slice(0, 200)}`);
    }
    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { drafts?: Array<Record<string, string | null>> } = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
    const staffByName = new Map(staffList.map((s) => [norm(s.name), s.id]));
    const clientByName = new Map(clientList.map((c) => [norm(c.name), c.id]));

    const drafts: DraftShift[] = (parsed.drafts ?? []).map((d) => {
      const flags: string[] = [];
      const staffName = d.staff_name ?? null;
      const clientName = d.client_name ?? null;
      const code = (d.service_code ?? "")?.toUpperCase() || null;
      const staffId = staffName ? staffByName.get(norm(staffName)) ?? null : null;
      const clientId = clientName ? clientByName.get(norm(clientName)) ?? null : null;
      if (staffName && !staffId) flags.push(`unmatched staff: "${staffName}"`);
      if (!clientName) flags.push("missing client");
      if (clientName && !clientId) flags.push(`unmatched client: "${clientName}"`);
      if (clientId && code && !authsByClient.get(clientId)?.has(code))
        flags.push(`${code} not authorized for client`);
      if (!d.starts_at || !d.ends_at) flags.push("missing time");
      return {
        staff_id: staffId,
        staff_label: staffName,
        client_id: clientId,
        client_label: clientName,
        service_code: code,
        starts_at: d.starts_at ?? null,
        ends_at: d.ends_at ?? null,
        notes: d.notes ?? null,
        flags,
      };
    });

    return { drafts };
  });
