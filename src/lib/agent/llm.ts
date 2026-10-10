// Provider-neutral client for the OpenAI-compatible Chat Completions API, over fetch.
// Server-only. It never logs the key, the request body or the response body.

export type LlmErrorKind = "rate_limit" | "timeout" | "auth" | "http" | "bad_response" | "network";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export const RATE_LIMIT_MESSAGE =
  "The model provider is rate limited. Try again in a minute. If it keeps happening, the free daily quota may be used up.";

/** A tool call as the provider sent it, kept whole so provider-specific fields survive the round trip. */
export interface RawToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  [extra: string]: unknown;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: RawToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
}

export interface ParsedToolCall {
  id: string;
  name: string;
  /** The arguments exactly as the model wrote them. May be invalid JSON. */
  argumentsText: string;
}

export interface ChatReply {
  /** Visible text with any reasoning blocks removed. */
  text: string;
  toolCalls: ParsedToolCall[];
  finishReason: string | null;
  /** The message to append to the history before sending tool results. */
  assistantMessage: Extract<ChatMessage, { role: "assistant" }>;
}

export interface LlmClient {
  chat(messages: ChatMessage[], tools: ToolDefinition[]): Promise<ChatReply>;
}

export interface LlmClientOptions {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  /** Total time spent waiting between retries. A longer wait is not attempted. */
  maxTotalWaitMs?: number;
  baseBackoffMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOTAL_WAIT_MS = 20_000;
const DEFAULT_BASE_BACKOFF_MS = 2_000;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Keywords some providers reject. Everything else in the existing tool schemas is passed through. */
const DROPPED_SCHEMA_KEYS = new Set(["additionalProperties", "$schema", "$id", "title"]);

export function sanitizeSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeSchema);
  if (!isObject(schema)) return schema;
  const out: Json = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DROPPED_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && isObject(value)) {
      // Keys here are property names, not schema keywords, so only the values are cleaned.
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, sanitizeSchema(sub)]));
    } else if (key === "items" || key === "anyOf" || key === "oneOf" || key === "allOf") {
      out[key] = sanitizeSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function toChatTools(tools: ToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: sanitizeSchema(tool.input_schema),
    },
  }));
}

export function buildChatRequest(
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[],
  temperature: number,
): Json {
  return {
    model,
    messages,
    ...(tools.length > 0 ? { tools: toChatTools(tools), tool_choice: "auto" } : {}),
    temperature,
    stream: false,
  };
}

/** Removes <think>...</think> style blocks. Unclosed blocks are dropped to the end of the text. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(think|thinking|reasoning)>[\s\S]*$/gi, "")
    .trim();
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (isObject(part) && part.type !== "thinking" && part.type !== "reasoning" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** Shared across responses so generated ids never repeat within a process. */
let generatedIdCounter = 0;

/** Turns the provider's tool_calls into a normalised list and a history-safe copy. */
function normaliseToolCalls(rawCalls: unknown, usedIds: Set<string>): { parsed: ParsedToolCall[]; echo: RawToolCall[] } {
  const parsed: ParsedToolCall[] = [];
  const echo: RawToolCall[] = [];
  if (!Array.isArray(rawCalls)) return { parsed, echo };
  for (const raw of rawCalls) {
    if (!isObject(raw)) continue;
    const fn = isObject(raw.function) ? raw.function : {};
    const name = typeof fn.name === "string" ? fn.name.trim() : "";
    let argumentsText = "";
    if (typeof fn.arguments === "string") argumentsText = fn.arguments;
    else if (fn.arguments !== undefined && fn.arguments !== null) argumentsText = JSON.stringify(fn.arguments);

    let id = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id.trim() : "";
    // Some providers omit ids or repeat them across parallel calls. Tool results are matched by id, so make each unique.
    while (id === "" || usedIds.has(id)) {
      generatedIdCounter += 1;
      id = `call_${generatedIdCounter}`;
    }
    usedIds.add(id);

    parsed.push({ id, name, argumentsText });
    echo.push({
      ...raw,
      id,
      type: "function",
      // Invalid JSON in the history can make a provider reject the next request, so send an empty object.
      function: { name, arguments: isJsonText(argumentsText) ? argumentsText : "{}" },
    });
  }
  return { parsed, echo };
}

function isJsonText(text: string): boolean {
  if (text.trim() === "") return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Parses a Chat Completions response body. Exported for tests. */
export function parseChatResponse(body: unknown): ChatReply {
  if (!isObject(body) || !Array.isArray(body.choices) || body.choices.length === 0 || !isObject(body.choices[0])) {
    throw new LlmError("bad_response", "The model provider returned a response without any choices. Try again.");
  }
  const choice = body.choices[0] as Json;
  const message = isObject(choice.message) ? choice.message : {};
  const text = stripReasoning(contentToText(message.content));
  const { parsed, echo } = normaliseToolCalls(message.tool_calls, new Set<string>());
  const finishReason = typeof choice.finish_reason === "string" ? choice.finish_reason : null;
  // Only content and tool_calls go back into the history. Reasoning fields are never echoed.
  const assistantMessage: ChatReply["assistantMessage"] = {
    role: "assistant",
    content: text === "" ? null : text,
    ...(echo.length > 0 ? { tool_calls: echo } : {}),
  };
  return { text, toolCalls: parsed, finishReason, assistantMessage };
}

function providerErrorText(body: unknown): string {
  const candidates: unknown[] = [];
  if (Array.isArray(body)) candidates.push(...body);
  else candidates.push(body);
  for (const item of candidates) {
    if (!isObject(item)) continue;
    const err = item.error;
    if (isObject(err) && typeof err.message === "string") return err.message;
    if (typeof err === "string") return err;
    if (typeof item.message === "string") return item.message;
  }
  return "";
}

function parseRetryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return null;
}

function shortSnippet(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 200 ? `${clean.slice(0, 197)}...` : clean;
}

export function createLlmClient(options: LlmClientOptions): LlmClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const temperature = options.temperature ?? 0.2;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxTotalWaitMs = options.maxTotalWaitMs ?? DEFAULT_MAX_TOTAL_WAIT_MS;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const doFetch = options.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function attempt(payload: string): Promise<{ response: Response; body: unknown }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${options.apiKey}` },
        body: payload,
        signal: controller.signal,
        cache: "no-store",
      });
      const raw = await response.text();
      let body: unknown = null;
      try {
        body = raw === "" ? null : JSON.parse(raw);
      } catch {
        body = { message: raw };
      }
      return { response, body };
    } catch (err) {
      if (timedOut || (err instanceof Error && err.name === "AbortError")) {
        throw new LlmError(
          "timeout",
          `The model provider did not answer within ${Math.round(timeoutMs / 1000)} seconds. Try again.`,
        );
      }
      throw new LlmError("network", "Could not reach the model provider. Check LLM_BASE_URL and the network.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async chat(messages, tools) {
      const payload = JSON.stringify(buildChatRequest(options.model, messages, tools, temperature));
      let waited = 0;
      for (let tryNo = 1; ; tryNo++) {
        const { response, body } = await attempt(payload);

        if (response.status === 429) {
          const retryAfter = parseRetryAfterMs(response.headers.get("retry-after"), Date.now());
          const wait = retryAfter ?? baseBackoffMs * 2 ** (tryNo - 1);
          if (tryNo >= maxAttempts || waited + wait > maxTotalWaitMs) {
            throw new LlmError("rate_limit", RATE_LIMIT_MESSAGE);
          }
          waited += wait;
          await sleep(wait);
          continue;
        }

        if (response.status === 401 || response.status === 403) {
          throw new LlmError("auth", "The model provider rejected the API key. Check LLM_API_KEY.");
        }
        if (!response.ok) {
          const detail = shortSnippet(providerErrorText(body));
          const hint = response.status === 404 ? " Check LLM_MODEL and LLM_BASE_URL." : "";
          throw new LlmError(
            "http",
            `The model provider returned HTTP ${response.status}${detail ? `: ${detail}` : "."}${hint}`,
          );
        }

        // Some providers answer 200 with an error object instead of choices.
        if (isObject(body) && !Array.isArray(body.choices) && body.error !== undefined) {
          const detail = shortSnippet(providerErrorText(body));
          throw new LlmError("http", `The model provider reported an error${detail ? `: ${detail}` : "."}`);
        }
        return parseChatResponse(body);
      }
    },
  };
}
