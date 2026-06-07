import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireOrgMembership } from "@/integrations/supabase/require-org";
import { EVV_SERVICE_CODES } from "@/lib/evv-codes";

// ---------- Schemas ----------

const ExtractInput = z.object({
  pdfBase64: z.string().min(100),
});

const BillingCodeRow = z.object({
  service_code: z.string(),
  rate_per_unit: z.number().nullable().optional(),
  annual_units: z.number().nullable().optional(),
  monthly_max_units: z.number().nullable().optional(),
  service_start_date: z.string().nullable().optional(),
  service_end_date: z.string().nullable().optional(),
});

const MedicationRow = z.object({
  medication_name: z.string(),
  dosage: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  frequency: z.string().nullable().optional(),
  scheduled_times: z.array(z.string()).default([]),
  instructions: z.string().nullable().optional(),
  prescriber: z.string().nullable().optional(),
  is_prn: z.boolean().optional(),
  prn_instructions: z.string().nullable().optional(),
});

const AdditionalSection = z.object({
  label: z.string().min(1).max(120),
  content: z.string().min(1).max(8000),
});

const ExtractedSchema = z.object({
  // Identity
  first_name: z.string().default(""),
  last_name: z.string().default(""),
  preferred_name: z.string().nullable().optional(),
  medicaid_id: z.string().default(""),
  date_of_birth: z.string().default(""),
  // Contact
  phone_number: z.string().nullable().optional(),
  physical_address: z.string().nullable().optional(),
  // Guardian / legal
  guardian_name: z.string().nullable().optional(),
  guardian_phone: z.string().nullable().optional(),
  guardian_relationship: z.string().nullable().optional(),
  guardian_legal_status: z.string().nullable().optional(),
  // Emergency contacts
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_secondary_name: z.string().nullable().optional(),
  emergency_contact_secondary_phone: z.string().nullable().optional(),
  // Authorized services
  authorized_codes: z.array(z.string()).default([]),
  billing_codes: z.array(BillingCodeRow).default([]),
  // Medications
  medications: z.array(MedicationRow).default([]),
  // Goals
  pcsp_goals: z.array(z.string()).default([]),
  // Clinical alerts (rolled into clients.special_directions as a single block)
  special_directions: z.string().nullable().optional(),
  // Behavior
  bc_tier: z.string().nullable().optional(),
  assigned_behaviorist: z.string().nullable().optional(),
  // Prompting (informational)
  prompting_levels: z.array(z.string()).default([]),
  // Unmapped — present to admin as create-new-section prompts
  additional_sections: z.array(AdditionalSection).default([]),
});
export type ExtractedClient = z.infer<typeof ExtractedSchema>;

const CommitInput = z.object({
  organizationId: z.string().uuid(),
  client: z.object({
    id: z.string().uuid().nullable().optional(),
    first_name: z.string().min(1).max(100),
    last_name: z.string().min(1).max(100),
    medicaid_id: z.string().max(50).default(""),
    date_of_birth: z.string().nullable().optional(),
    phone_number: z.string().max(50).nullable().optional(),
    physical_address: z.string().max(500).nullable().optional(),
    emergency_contact_name: z.string().max(200).nullable().optional(),
    emergency_contact_phone: z.string().max(50).nullable().optional(),
    special_directions: z.string().max(8000).nullable().optional(),
    pcsp_goals: z.array(z.string().min(1).max(500)).max(100).default([]),
    authorized_codes: z.array(z.string().min(2).max(8)).max(50).default([]),
    billing_codes: z.array(BillingCodeRow).max(50).default([]),
    medications: z.array(MedicationRow).max(100).default([]),
  }),
  additionalSections: z.array(AdditionalSection).max(40).default([]),
  pcspDocument: z
    .object({
      storagePath: z.string().min(1).max(1024),
      fileName: z.string().min(1).max(255),
      fileSizeBytes: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
});

// ---------- PDF text extraction (Worker-safe via unpdf) ----------

async function extractPdfText(base64: string): Promise<string> {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

// ---------- AI extraction ----------

const KNOWN_CODES = EVV_SERVICE_CODES.map((c) => c.code).join(", ");

const SYSTEM_PROMPT = `You are an extraction engine for Utah DHHS / DSPD Person-Centered Support Plans (PCSPs) and related client profile documents. You receive raw text and must return ONLY the structured fields requested via the function call.

ABSOLUTE RULES:
- Never invent or infer values that are not literally present in the document. If a field is not present, return null (or an empty array).
- Quote phone numbers, addresses, names verbatim from the document.
- DSPD service codes MUST come from this allow-list: ${KNOWN_CODES}.
- For any rich content that has no matching structured field (diagnoses + ICD-10, allergies, immunizations, risk assessment, daily schedule / routine, communication dictionary, financial / representative-payee, support team roster, review history, anything similar), return it as a labeled block in additional_sections — DO NOT discard it.`;

const USER_INSTRUCTIONS = `Extract the following from the document text. Leave any field null/empty when the document does not state it. Do not guess.

Identity & contact:
- first_name, last_name (the individual receiving services, not parents/guardians/staff)
- preferred_name (nickname / "goes by" / "preferred"), if present
- medicaid_id (Utah Medicaid Member ID — typically 10 digits; strip dashes/spaces)
- date_of_birth (ISO YYYY-MM-DD)
- phone_number (the individual's primary phone)
- physical_address (full street, city, state, zip — the service / residential address)

Guardian / legal:
- guardian_name, guardian_phone, guardian_relationship, guardian_legal_status (e.g. "Plenary guardian", "Limited guardian", "Self")

Emergency contacts:
- emergency_contact_name, emergency_contact_phone (primary)
- emergency_contact_secondary_name, emergency_contact_secondary_phone

Authorized services:
- authorized_codes: every DSPD service code authorized in this plan (from the allow-list only).
- billing_codes: rows of {service_code, rate_per_unit (dollars per unit), annual_units, monthly_max_units, service_start_date YYYY-MM-DD, service_end_date YYYY-MM-DD} for each authorized service whose units or rates are stated.

Medications (one row per prescription):
- medications: {medication_name, dosage, route, frequency, scheduled_times (array of "HH:MM"), instructions, prescriber, is_prn, prn_instructions}

PCSP goals:
- pcsp_goals: each distinct goal / objective / action-plan item written for the individual. Pull verbatim (1 line each, trimmed to ~300 chars). Look under headings like "Action Plan", "Service Objectives", "Goals", "Outcomes", "Desired Outcomes". Skip section headers and boilerplate. Up to 25 goals.

Clinical alerts:
- special_directions: a single short paragraph combining diet, swallowing, seizure protocol, choking/aspiration precautions, and de-escalation guidance the document specifies. Leave null if none.

Behavior:
- bc_tier (e.g. "Tier 1", "Mild", "Moderate", "Severe")
- assigned_behaviorist (name of BCBA / behavior specialist)

Prompting levels (informational): prompting_levels (array of strings)

Additional information: additional_sections — for diagnoses (with ICD-10), allergies, immunizations, risk assessment, daily schedule, communication dictionary, financial / rep-payee, support team roster, HRC review history, rights restrictions, and any other rich block that does not map above. Each item: {label, content}. Keep content concise but complete (up to ~2000 chars).`;

export const extractClientFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExtractInput.parse(d))
  .handler(async ({ data }): Promise<ExtractedClient> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const pdfText = await extractPdfText(data.pdfBase64);
    if (!pdfText.trim()) {
      throw new Error("Could not read any text from this PDF (it may be a scanned image).");
    }

    const truncated = pdfText.slice(0, 120_000);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `${USER_INSTRUCTIONS}\n\n--- DOCUMENT TEXT START ---\n${truncated}\n--- DOCUMENT TEXT END ---`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Lovable AI.");
      throw new Error(`AI gateway error: ${res.status} ${t.slice(0, 200)}`);
    }

    const j = await res.json();
    const raw = j.choices?.[0]?.message?.content;
    if (!raw) throw new Error("AI returned no content");
    let args: unknown;
    try {
      args = JSON.parse(raw);
    } catch {
      throw new Error("AI returned malformed JSON");
    }

    const parsed = ExtractedSchema.parse(args);

    // Sanitize codes against allow-list
    const allow = new Set(EVV_SERVICE_CODES.map((c) => c.code));
    parsed.authorized_codes = Array.from(
      new Set(parsed.authorized_codes.map((c) => c.trim().toUpperCase()).filter((c) => allow.has(c))),
    );
    parsed.billing_codes = parsed.billing_codes
      .map((r) => ({ ...r, service_code: r.service_code.trim().toUpperCase() }))
      .filter((r) => allow.has(r.service_code));
    // Merge billing_codes' service codes into authorized_codes
    for (const b of parsed.billing_codes) {
      if (!parsed.authorized_codes.includes(b.service_code)) {
        parsed.authorized_codes.push(b.service_code);
      }
    }

    parsed.pcsp_goals = Array.from(
      new Set(parsed.pcsp_goals.map((g) => g.trim()).filter((g) => g.length > 2)),
    ).slice(0, 25);
    parsed.medicaid_id = parsed.medicaid_id.replace(/\D+/g, "");

    return parsed;
  });

// ---------- Commit ----------

export const commitClientFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CommitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireOrgMembership(supabase, userId, data.organizationId, "manager");
    const c = data.client;

    // Locate existing client
    let existingId = c.id ?? null;
    if (!existingId && c.medicaid_id) {
      const { data: byMed } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("medicaid_id", c.medicaid_id)
        .limit(1)
        .maybeSingle();
      if (byMed?.id) existingId = byMed.id;
    }
    if (!existingId) {
      const { data: byName } = await supabase
        .from("clients")
        .select("id")
        .eq("organization_id", data.organizationId)
        .ilike("first_name", c.first_name)
        .ilike("last_name", c.last_name)
        .limit(1)
        .maybeSingle();
      if (byName?.id) existingId = byName.id;
    }

    const fieldsFilled: string[] = [];
    const setIfPresent = <T,>(obj: Record<string, unknown>, key: string, val: T | null | undefined) => {
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        obj[key] = val;
        fieldsFilled.push(key);
      }
    };

    const clientPayload: Record<string, unknown> = {
      organization_id: data.organizationId,
      first_name: c.first_name,
      last_name: c.last_name,
      account_status: "active",
    };
    setIfPresent(clientPayload, "medicaid_id", c.medicaid_id || null);
    setIfPresent(clientPayload, "date_of_birth", c.date_of_birth || null);
    setIfPresent(clientPayload, "phone_number", c.phone_number || null);
    setIfPresent(clientPayload, "physical_address", c.physical_address || null);
    setIfPresent(clientPayload, "emergency_contact_name", c.emergency_contact_name || null);
    setIfPresent(clientPayload, "emergency_contact_phone", c.emergency_contact_phone || null);
    setIfPresent(clientPayload, "special_directions", c.special_directions || null);
    if (c.pcsp_goals.length) {
      clientPayload.pcsp_goals = c.pcsp_goals;
      fieldsFilled.push("pcsp_goals");
    }
    if (c.authorized_codes.length) {
      clientPayload.job_code = c.authorized_codes;
      clientPayload.authorized_dspd_codes = c.authorized_codes;
      fieldsFilled.push("authorized_codes");
    }

    let clientId: string;
    if (existingId) {
      const { error } = await supabase.from("clients").update(clientPayload).eq("id", existingId);
      if (error) throw new Error(error.message);
      clientId = existingId;
    } else {
      const { data: ins, error } = await supabase
        .from("clients")
        .insert(clientPayload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      clientId = ins!.id as string;
    }

    // Billing codes — upsert by (org, client, service_code)
    let billingCodesWritten = 0;
    for (const r of c.billing_codes) {
      const payload: Record<string, unknown> = {
        organization_id: data.organizationId,
        client_id: clientId,
        service_code: r.service_code,
        unit_type: "unit",
        rate_source: "PCSP (NECTAR import)",
        rate_source_at: new Date().toISOString(),
      };
      if (r.rate_per_unit != null) payload.rate_per_unit = r.rate_per_unit;
      if (r.annual_units != null) payload.annual_unit_authorization = r.annual_units;
      if (r.monthly_max_units != null) payload.monthly_max_units = r.monthly_max_units;
      if (r.service_start_date) payload.service_start_date = r.service_start_date;
      if (r.service_end_date) payload.service_end_date = r.service_end_date;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("client_billing_codes")
        .upsert(payload, { onConflict: "organization_id,client_id,service_code" });
      if (!error) billingCodesWritten++;
    }
    if (billingCodesWritten) fieldsFilled.push(`billing_codes(${billingCodesWritten})`);

    // Medications — insert if no active med with same (case-insensitive) name + dose
    let medsWritten = 0;
    if (c.medications.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingMeds } = await (supabase as any)
        .from("client_medications")
        .select("medication_name,dosage,is_active")
        .eq("client_id", clientId);
      const seen = new Set(
        (existingMeds ?? []).map(
          (m: { medication_name: string; dosage: string | null }) =>
            `${(m.medication_name || "").trim().toLowerCase()}|${(m.dosage || "").trim().toLowerCase()}`,
        ),
      );
      for (const m of c.medications) {
        const key = `${m.medication_name.trim().toLowerCase()}|${(m.dosage || "").trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("client_medications").insert({
          organization_id: data.organizationId,
          client_id: clientId,
          medication_name: m.medication_name.trim(),
          dosage: m.dosage || null,
          route: m.route || null,
          frequency: m.frequency || null,
          scheduled_times: m.scheduled_times ?? [],
          instructions: m.instructions || null,
          prescriber: m.prescriber || null,
          is_prn: !!m.is_prn,
          prn_instructions: m.prn_instructions || null,
        });
        if (!error) {
          medsWritten++;
          seen.add(key);
        }
      }
    }
    if (medsWritten) fieldsFilled.push(`medications(${medsWritten})`);

    // PCSP document dedupe — one row per client of document_type='PCSP'
    if (data.pcspDocument) {
      const doc = data.pcspDocument;
      const fileUrlRef = `storage://client-documents/${doc.storagePath}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingDoc } = await (supabase as any)
        .from("client_documents")
        .select("id")
        .eq("client_id", clientId)
        .eq("organization_id", data.organizationId)
        .eq("document_type", "PCSP")
        .limit(1)
        .maybeSingle();
      if (existingDoc?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from("client_documents")
          .update({
            file_name: doc.fileName,
            file_url: fileUrlRef,
            storage_path: doc.storagePath,
            file_size_bytes: doc.fileSizeBytes ?? null,
            uploaded_at: new Date().toISOString(),
            uploaded_by: userId,
          })
          .eq("id", existingDoc.id);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("client_documents").insert({
          organization_id: data.organizationId,
          client_id: clientId,
          file_name: doc.fileName,
          document_type: "PCSP",
          file_url: fileUrlRef,
          storage_path: doc.storagePath,
          file_size_bytes: doc.fileSizeBytes ?? null,
          uploaded_by: userId,
        });
      }
    }

    // Additional sections → custom fields
    let sectionsWritten = 0;
    for (const s of data.additionalSections) {
      const fieldKey = s.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 60);
      if (!fieldKey) continue;

      // Upsert definition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingDef } = await (supabase as any)
        .from("custom_field_definitions")
        .select("id")
        .eq("organization_id", data.organizationId)
        .eq("entity_kind", "client")
        .eq("field_key", fieldKey)
        .maybeSingle();
      let defId = existingDef?.id as string | undefined;
      if (!defId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: insDef, error: defErr } = await (supabase as any)
          .from("custom_field_definitions")
          .insert({
            organization_id: data.organizationId,
            entity_kind: "client",
            field_key: fieldKey,
            field_label: s.label,
            data_type: "text",
            created_by: userId,
          })
          .select("id")
          .single();
        if (defErr) continue;
        defId = insDef!.id as string;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: valErr } = await (supabase as any)
        .from("custom_field_values")
        .upsert(
          {
            organization_id: data.organizationId,
            definition_id: defId,
            entity_kind: "client",
            entity_id: clientId,
            value_text: s.content,
          },
          { onConflict: "definition_id,entity_id" },
        );
      if (!valErr) sectionsWritten++;
    }
    if (sectionsWritten) fieldsFilled.push(`additional_sections(${sectionsWritten})`);

    return {
      id: clientId,
      created: !existingId,
      fieldsFilled,
      fieldCount: fieldsFilled.length,
    };
  });
