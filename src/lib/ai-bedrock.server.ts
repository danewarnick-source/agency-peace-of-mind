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
    if (status === 403 || /AccessDenied|UnrecognizedClient|InvalidSignature/i.test(name)) {
      throw new BedrockError(
        401,
        "AWS Bedrock rejected the credentials or denied access to the configured model. Check AWS keys and model access in the Bedrock console.",
      );
    }
    if (status === 429 || /Throttl/i.test(name)) {
      throw new BedrockError(429, "AWS Bedrock throttled the request. Try again in a moment.");
    }
    throw new BedrockError(
      status,
      `AWS Bedrock error (${name}): ${err.message ?? "unknown"}`.slice(0, 400),
    );
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
