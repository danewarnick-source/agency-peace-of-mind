// Deno-side mirror of the OpenAI-compatible Bedrock shim used by src/lib/ai-bedrock.server.ts.
//
// Edge Functions run on Deno and cannot import from src/ — this file provides
// the same `gatewayFetch(body)` surface (OpenAI chat-completions request shape
// in, Response-like { ok, status, json(), text() } out) so the two existing
// edge functions only swap their fetch line.
//
// Uses the same env vars: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
// BEDROCK_MODEL_ID. Fails loudly on bad creds / access denied / throttling.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from "npm:@aws-sdk/client-bedrock-runtime@3";

type OpenAITextPart = { type: "text"; text: string };
type OpenAIImagePart = { type: "image_url"; image_url: { url: string } };
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;
type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
};
type OpenAIToolFn = {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown> };
};
type OpenAIToolChoice =
  | "auto"
  | "required"
  | "none"
  | { type: "function"; function: { name: string } };

export interface OpenAIChatBody {
  model?: string;
  messages: OpenAIMessage[];
  tools?: OpenAIToolFn[];
  tool_choice?: OpenAIToolChoice;
  response_format?: { type: "json_object" | "text" };
  temperature?: number;
  max_tokens?: number;
}

export interface GatewayFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

function getClient(): BedrockRuntimeClient {
  const region = Deno.env.get("AWS_REGION");
  const accessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");
  if (!region) throw new Error("AWS_REGION is not configured.");
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("AWS Bedrock credentials are not configured.");
  }
  return new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(url.trim());
  if (!m) throw new Error("Unsupported image_url (only data: URLs are accepted).");
  const mime = m[1].toLowerCase();
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

function mimeToImageFormat(mime: string): "jpeg" | "png" | "gif" | "webp" | null {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return null;
}

function buildMessages(messages: OpenAIMessage[]): { system: string; convo: Message[] } {
  const systemParts: string[] = [];
  const convo: Message[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(typeof m.content === "string" ? m.content : "");
      continue;
    }
    const blocks: ContentBlock[] = [];
    if (typeof m.content === "string") {
      blocks.push({ text: m.content } as ContentBlock);
    } else {
      for (const part of m.content) {
        if (part.type === "text") blocks.push({ text: part.text } as ContentBlock);
        else if (part.type === "image_url") {
          const { bytes, mime } = dataUrlToBytes(part.image_url.url);
          const fmt = mimeToImageFormat(mime);
          if (!fmt) throw new Error(`Unsupported image mime: ${mime}`);
          blocks.push({ image: { format: fmt, source: { bytes } } } as ContentBlock);
        }
      }
    }
    convo.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: blocks.length ? blocks : [{ text: "" } as ContentBlock],
    });
  }
  if (convo.length === 0 || convo[0].role !== "user") {
    convo.unshift({ role: "user", content: [{ text: "(no input)" } as ContentBlock] });
  }
  return { system: systemParts.join("\n\n"), convo };
}

export async function gatewayFetch(body: OpenAIChatBody): Promise<GatewayFetchResponse> {
  try {
    const client = getClient();
    const modelId = Deno.env.get("BEDROCK_MODEL_ID");
    if (!modelId) throw new Error("BEDROCK_MODEL_ID is not configured.");

    const { system, convo } = buildMessages(body.messages);
    const jsonMode = body.response_format?.type === "json_object";
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const systemPrompt =
      jsonMode && !hasTools
        ? `${system}\n\nIMPORTANT: Respond with a single valid JSON object only. No prose, no code fences, no commentary.`
        : system;

    let toolConfig: ConstructorParameters<typeof ConverseCommand>[0]["toolConfig"] | undefined;
    if (hasTools) {
      toolConfig = {
        tools: body.tools!.map((t) => ({
          toolSpec: {
            name: t.function.name,
            description: t.function.description ?? "",
            inputSchema: { json: t.function.parameters as Record<string, unknown> },
          },
        })),
      };
      if (body.tool_choice && body.tool_choice !== "none") {
        if (body.tool_choice === "auto") toolConfig.toolChoice = { auto: {} };
        else if (body.tool_choice === "required") toolConfig.toolChoice = { any: {} };
        else if (typeof body.tool_choice === "object")
          toolConfig.toolChoice = { tool: { name: body.tool_choice.function.name } };
      }
    }

    const out = await client.send(
      new ConverseCommand({
        modelId,
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        messages: convo,
        toolConfig,
        inferenceConfig: {
          maxTokens: body.max_tokens ?? 4096,
          temperature: body.temperature ?? 0.2,
        },
      }),
    );

    const blocks = out.output?.message?.content ?? [];
    let textOut = "";
    const toolCalls: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }> = [];
    for (const b of blocks) {
      if ("text" in b && typeof b.text === "string") textOut += b.text;
      else if ("toolUse" in b && b.toolUse) {
        toolCalls.push({
          id: b.toolUse.toolUseId ?? `call_${toolCalls.length}`,
          type: "function",
          function: {
            name: b.toolUse.name ?? "",
            arguments: JSON.stringify(b.toolUse.input ?? {}),
          },
        });
      }
    }
    const payload = {
      id: `bedrock-${Date.now()}`,
      object: "chat.completion",
      model: modelId,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: textOut || null,
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          },
          finish_reason: toolCalls.length ? "tool_calls" : "stop",
        },
      ],
    };
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const rawStatus = err.$metadata?.httpStatusCode ?? 0;
    const name = err.name ?? "BedrockError";
    let status = rawStatus || 500;
    let msg = `AWS Bedrock error (${name}): ${err.message ?? "unknown"}`;
    if (rawStatus === 403 || /AccessDenied|UnrecognizedClient|InvalidSignature/i.test(name)) {
      status = 401;
      msg =
        "AWS Bedrock rejected the credentials or denied access to the configured model.";
    } else if (rawStatus === 429 || /Throttl/i.test(name)) {
      status = 429;
      msg = "AWS Bedrock throttled the request. Try again in a moment.";
    }
    const payload = { error: { message: msg, type: name, code: status } };
    return {
      ok: false,
      status,
      json: async () => payload,
      text: async () => msg,
    };
  }
}
