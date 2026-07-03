import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { gatewayFetch } from "@/lib/ai-bedrock.server";

const MedSchema = z.object({
  medication_name: z.string().min(1).max(200),
  dosage: z.string().max(100).optional().nullable(),
  frequency: z.string().max(100).optional().nullable(),
  route: z.string().max(60).optional().nullable(),
  scheduled_times: z.array(z.string().max(20)).default([]),
  instructions: z.string().max(2000).optional().nullable(),
  prescriber: z.string().max(200).optional().nullable(),
});

const ParseInput = z.object({
  imageBase64: z.string().optional(),
  mime: z.string().optional(),
  text: z.string().optional(),
});

/** Use Lovable AI Gateway to parse a physician order (image or text) into structured meds. */
export const parseMedicationsAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ParseInput.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY not configured");

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text:
          "Extract every medication prescribed in this document. For each, return medication_name, dosage (e.g. '10 mg'), frequency (e.g. 'BID', 'q6h', 'once daily'), route (PO, IM, SQ, topical, etc.), and scheduled_times as 24-hour HH:MM strings (e.g. ['08:00','20:00']). Include prescriber name if visible and any special instructions.",
      },
    ];
    if (data.text) userContent.push({ type: "text", text: data.text });
    if (data.imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:${data.mime || "image/jpeg"};base64,${data.imageBase64}` },
      });
    }

    const res = await gatewayFetch({
        model: "bedrock",
        messages: [
          {
            role: "system",
            content:
              "You are an eMAR data extraction engine for Utah DHHS DSPD providers. Extract medications from physician orders, MARs, or pharmacy printouts. Always call the function exactly once.",
          },
          { role: "user", content: userContent },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_medications",
              description: "Return parsed medication list.",
              parameters: {
                type: "object",
                properties: {
                  medications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        medication_name: { type: "string" },
                        dosage: { type: "string" },
                        frequency: { type: "string" },
                        route: { type: "string" },
                        scheduled_times: { type: "array", items: { type: "string" } },
                        instructions: { type: "string" },
                        prescriber: { type: "string" },
                      },
                      required: ["medication_name"],
                    },
                  },
                },
                required: ["medications"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_medications" } },
      });

    if (!res.ok) {
      const t = await res.text();
      if (res.status === 429) throw new Error("AI rate limit — try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Add funds in Lovable AI.");
      throw new Error(`AI gateway error: ${res.status} ${t.slice(0, 200)}`);
    }
    const j = await res.json();
    const call = j.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments ? JSON.parse(call.function.arguments) : null;
    if (!args?.medications) throw new Error("AI returned no medications");
    const meds = (args.medications as unknown[])
      .map((m) => {
        try { return MedSchema.parse(m); } catch { return null; }
      })
      .filter(Boolean);
    return { medications: meds };
  });
