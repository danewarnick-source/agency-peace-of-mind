// AWS Bedrock adapter for NECTAR.
//
// Exposes `callBedrockChatCompletions(...)` with the SAME request shape and
// SAME OpenAI-style response shape that the existing NECTAR call sites
// expect ({ choices: [{ message: { content } }] }), so the rest of NECTAR's
// Propose / Import / extraction code stays untouched.
//
// Server-only: do not import from client code.

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { FetchHttpHandler } from "@smithy/fetch-http-handler";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type BedrockChatRequest = {
  messages: ChatMessage[];
  /** When { type: "json_object" }, we instruct Claude to reply with strict JSON. */
  response_format?: { type: "json_object" } | { type: "text" };
  /** Optional abort signal so callers can keep their existing timeout logic. */
  signal?: AbortSignal;
  /** Optional max tokens; defaults to 4096 which matches NECTAR's prior usage. */
  maxTokens?: number;
};

export type BedrockChatResponse = {
  choices: Array<{ message: { content: string } }>;
};

/**
 * Thrown when Bedrock returns an error. `status` mirrors the HTTP-style codes
 * the old gateway used (401, 402, 429, 500) so existing call sites can keep
 * their current error branching with minimal changes.
 */
export class BedrockError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "BedrockError";
  }
}

function getClient(): BedrockRuntimeClient {
  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!region) throw new BedrockError(500, "AWS_REGION is not configured.");
  if (!accessKeyId || !secretAccessKey) {
    throw new BedrockError(
      401,
      "AWS Bedrock credentials are not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY).",
    );
  }
  return new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
    requestHandler: new FetchHttpHandler(),
  });
}

function getModelId(): string {
  const id = process.env.BEDROCK_MODEL_ID;
  if (!id) throw new BedrockError(500, "BEDROCK_MODEL_ID is not configured.");
  return id;
}

function splitSystem(messages: ChatMessage[]): {
  system: string;
  convo: Message[];
} {
  const systemParts: string[] = [];
  const convo: Message[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    convo.push({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: m.content } satisfies ContentBlock],
    });
  }
  // Bedrock Converse requires conversation to start with a user turn.
  if (convo.length === 0 || convo[0].role !== "user") {
    convo.unshift({ role: "user", content: [{ text: "(no input)" } satisfies ContentBlock] });
  }
  return { system: systemParts.join("\n\n"), convo };
}

/**
 * Call AWS Bedrock via the Converse API and return a response shaped like the
 * OpenAI chat-completions response NECTAR already consumes.
 *
 * Fails loudly — never silently falls back, never invents content.
 */
export async function callBedrockChatCompletions(
  req: BedrockChatRequest,
): Promise<BedrockChatResponse> {
  const client = getClient();
  const modelId = getModelId();

  const { system, convo } = splitSystem(req.messages);
  const jsonMode = req.response_format?.type === "json_object";
  const systemPrompt = jsonMode
    ? `${system}\n\nIMPORTANT: Respond with a single valid JSON object only. No prose, no code fences, no commentary.`
    : system;

  const command = new ConverseCommand({
    modelId,
    system: systemPrompt ? [{ text: systemPrompt }] : undefined,
    messages: convo,
    inferenceConfig: {
      maxTokens: req.maxTokens ?? 4096,
      temperature: 0.2,
    },
  });

  let out;
  try {
    out = await client.send(command, { abortSignal: req.signal });
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const status = err.$metadata?.httpStatusCode ?? 500;
    const name = err.name ?? "BedrockError";
    if (name === "AbortError") throw e;
    const region = process.env.AWS_REGION ?? "(unset)";
    const detail = `Bedrock ${name} (${status}) for model ${modelId} in ${region}: ${err.message ?? "unknown"}`;
    console.error("[bedrock]", detail);
    let mapped = status || 500;
    if (status === 403 || /AccessDenied|UnrecognizedClient|InvalidSignature/i.test(name)) mapped = 401;
    else if (status === 429 || /Throttl/i.test(name)) mapped = 429;
    throw new BedrockError(mapped, detail.slice(0, 600));
  }


  const blocks = out.output?.message?.content ?? [];
  const text = blocks
    .map((b) => ("text" in b && typeof b.text === "string" ? b.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new BedrockError(502, "AWS Bedrock returned an empty response.");
  }

  return { choices: [{ message: { content: text } }] };
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible gateway shim.
//
// Lets every existing call site keep its `await fetch("…/chat/completions",
// { body: JSON.stringify({…}) })` shape — they just swap the fetch line for
// `await gatewayFetch({…})` and KEEP their headers, body, response parsing
// (incl. tool_calls / images / json_object) and error branches unchanged.
//
// Returns a tiny Response-shaped object: `{ ok, status, json(), text() }`.
// ─────────────────────────────────────────────────────────────────────────────

import { InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export interface GatewayFetchResponse {
  ok: boolean;
  status: number;
  // Loose return type — call sites consume varied shapes (chat completions,
  // embeddings, tool calls). Narrow inside the caller as needed.
  json(): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  text(): Promise<string>;
}

type OpenAITextPart = { type: "text"; text: string };
type OpenAIImagePart = { type: "image_url"; image_url: { url: string } };
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;
type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OpenAIContentPart[];
  tool_call_id?: string;
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

function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+)(?:;base64)?,(.*)$/i.exec(url.trim());
  if (!m) throw new BedrockError(400, "Unsupported image_url (only data: URLs are accepted).");
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], "base64");
  return { bytes: new Uint8Array(buf), mime };
}

function mimeToImageFormat(mime: string): "jpeg" | "png" | "gif" | "webp" | null {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return null;
}

function mimeToDocFormat(
  mime: string,
): "pdf" | "csv" | "doc" | "docx" | "xls" | "xlsx" | "html" | "txt" | "md" | null {
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("csv")) return "csv";
  if (mime.includes("html")) return "html";
  if (mime.includes("markdown")) return "md";
  if (mime.includes("plain") || mime === "text/txt") return "txt";
  if (mime.includes("officedocument.wordprocessingml")) return "docx";
  if (mime.includes("msword")) return "doc";
  if (mime.includes("officedocument.spreadsheetml")) return "xlsx";
  if (mime.includes("excel")) return "xls";
  return null;
}

function buildBedrockMessages(messages: OpenAIMessage[]): { system: string; convo: Message[] } {
  const systemParts: string[] = [];
  const convo: Message[] = [];
  let docCounter = 0;
  for (const m of messages) {
    if (m.role === "system") {
      if (typeof m.content === "string") systemParts.push(m.content);
      else
        systemParts.push(
          m.content
            .filter((p): p is OpenAITextPart => p.type === "text")
            .map((p) => p.text)
            .join("\n"),
        );
      continue;
    }
    if (m.role === "tool") {
      // Map OpenAI tool result → Bedrock toolResult block.
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      convo.push({
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: m.tool_call_id ?? "tool",
              content: [{ text }],
            },
          } as ContentBlock,
        ],
      });
      continue;
    }
    const blocks: ContentBlock[] = [];
    if (typeof m.content === "string") {
      blocks.push({ text: m.content } as ContentBlock);
    } else {
      for (const part of m.content) {
        if (part.type === "text") {
          blocks.push({ text: part.text } as ContentBlock);
        } else if (part.type === "image_url") {
          const { bytes, mime } = dataUrlToBytes(part.image_url.url);
          const imgFmt = mimeToImageFormat(mime);
          if (imgFmt) {
            blocks.push({ image: { format: imgFmt, source: { bytes } } } as ContentBlock);
          } else {
            const docFmt = mimeToDocFormat(mime);
            if (!docFmt) {
              throw new BedrockError(400, `Unsupported attachment mime type: ${mime}`);
            }
            docCounter += 1;
            blocks.push({
              document: {
                format: docFmt,
                name: `attachment-${docCounter}`,
                source: { bytes },
              },
            } as ContentBlock);
          }
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

/**
 * OpenAI-compatible chat-completions shim backed by Bedrock Converse.
 * Caller passes the same body they used to send to Lovable AI gateway.
 * Returns a Response-shaped object so existing `res.ok / res.status /
 * res.json() / res.text()` consumers keep working unchanged.
 */
export async function gatewayFetch(
  // Loose body type — call sites build OpenAI chat-completions bodies with
  // varied content/tool shapes. Validated at runtime by buildBedrockMessages.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  opts?: { signal?: AbortSignal },
): Promise<GatewayFetchResponse> {
  try {
    const client = getClient();
    const modelId = getModelId();
    const { system, convo } = buildBedrockMessages(body.messages);

    const jsonMode = body.response_format?.type === "json_object";
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const systemPrompt =
      jsonMode && !hasTools
        ? `${system}\n\nIMPORTANT: Respond with a single valid JSON object only. No prose, no code fences, no commentary.`
        : system;

    // Bedrock's typed `toolConfig` shape doesn't accept plain JSON schemas via
    // its TS overloads, so we build as a permissive object and cast at the
    // ConverseCommand boundary. Runtime shape is correct.
    let toolConfig: Record<string, unknown> | undefined;
    if (hasTools) {
      const tc: Record<string, unknown> = {
        tools: (body.tools as any[]).map((t: any) => ({
          toolSpec: {
            name: t.function.name,
            description: t.function.description ?? "",
            inputSchema: { json: t.function.parameters },
          },
        })),
      };
      if (body.tool_choice && body.tool_choice !== "none") {
        if (body.tool_choice === "auto") {
          tc.toolChoice = { auto: {} };
        } else if (body.tool_choice === "required") {
          tc.toolChoice = { any: {} };
        } else if (typeof body.tool_choice === "object") {
          tc.toolChoice = { tool: { name: body.tool_choice.function.name } };
        }
      }
      toolConfig = tc;
    }

    const cmd = new ConverseCommand({
      modelId,
      system: systemPrompt ? [{ text: systemPrompt }] : undefined,
      messages: convo,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toolConfig: toolConfig as any,
      inferenceConfig: {
        maxTokens: body.max_tokens ?? 4096,
        temperature: body.temperature ?? 0.2,
      },
    });

    const out = await client.send(cmd, { abortSignal: opts?.signal });
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

    // Map Bedrock's stopReason to an OpenAI-style finish_reason so callers can
    // detect truncation ("length") vs a normal stop and react (e.g. retry with
    // smaller input). Bedrock values: end_turn | tool_use | max_tokens |
    // stop_sequence | guardrail_intervened | content_filtered.
    const stop = out.stopReason;
    let finishReason: "stop" | "length" | "tool_calls" | "content_filter" = "stop";
    if (toolCalls.length || stop === "tool_use") finishReason = "tool_calls";
    else if (stop === "max_tokens") finishReason = "length";
    else if (stop === "content_filtered" || stop === "guardrail_intervened")
      finishReason = "content_filter";

    const openAIResponse = {
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
          finish_reason: finishReason,
        },
      ],
    };


    return {
      ok: true,
      status: 200,
      json: async () => openAIResponse,
      text: async () => JSON.stringify(openAIResponse),
    };
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") throw e;
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const rawStatus = err.$metadata?.httpStatusCode ?? 0;
    const name = err.name ?? "BedrockError";
    const region = process.env.AWS_REGION ?? "(unset)";
    const modelIdSafe = (() => { try { return getModelId(); } catch { return "(unset)"; } })();
    const detail = `Bedrock ${name} (${rawStatus || 500}) for model ${modelIdSafe} in ${region}: ${err.message ?? "unknown"}`;
    console.error("[bedrock]", detail);
    let status = rawStatus || 500;
    if (rawStatus === 403 || /AccessDenied|UnrecognizedClient|InvalidSignature/i.test(name)) status = 401;
    else if (rawStatus === 429 || /Throttl/i.test(name)) status = 429;
    const msg = detail.slice(0, 600);
    const payload = { error: { message: msg, type: name, code: status } };
    return {
      ok: false,
      status,
      json: async () => payload,
      text: async () => msg,
    };
  }

}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-compatible embeddings shim backed by Amazon Titan Text Embeddings v2.
// Keeps the `{ data: [{ embedding: number[] }] }` shape that callers expect.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenAIEmbedBody {
  model?: string;
  input: string | string[];
  dimensions?: number;
}

export async function gatewayEmbeddingsFetch(
  body: OpenAIEmbedBody,
): Promise<GatewayFetchResponse> {
  try {
    const client = getClient();
    const modelId = process.env.BEDROCK_EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v2:0";
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const dimensions =
      typeof body.dimensions === "number" && [256, 512, 1024].includes(body.dimensions)
        ? body.dimensions
        : 1024;

    const data: Array<{ object: "embedding"; index: number; embedding: number[] }> = [];
    for (let i = 0; i < inputs.length; i++) {
      const input = (inputs[i] ?? "").slice(0, 8000);
      const cmd = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({ inputText: input, dimensions, normalize: true }),
      });
      const out = await client.send(cmd);
      const raw = new TextDecoder().decode(out.body);
      const parsed = JSON.parse(raw) as { embedding?: number[] };
      const vec = parsed.embedding ?? [];
      data.push({ object: "embedding", index: i, embedding: vec });
    }

    const payload = { object: "list", data, model: modelId };
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const rawStatus = err.$metadata?.httpStatusCode ?? 500;
    const name = err.name ?? "BedrockError";
    const region = process.env.AWS_REGION ?? "(unset)";
    const embedModelId =
      process.env.BEDROCK_EMBEDDING_MODEL_ID || "amazon.titan-embed-text-v2:0";
    const detail = `Bedrock ${name} (${rawStatus}) for embedding model ${embedModelId} in ${region}: ${err.message ?? "unknown"}`;
    console.error("[bedrock-embed]", detail);
    let status = rawStatus;
    if (rawStatus === 403 || /AccessDenied/i.test(name)) status = 401;
    else if (rawStatus === 429 || /Throttl/i.test(name)) status = 429;
    const msg = detail.slice(0, 600);
    const payload = { error: { message: msg, type: name, code: status } };
    return {
      ok: false,
      status,
      json: async () => payload,
      text: async () => msg,
    };
  }

}
