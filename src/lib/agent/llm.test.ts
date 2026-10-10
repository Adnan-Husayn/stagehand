import { describe, expect, it, vi } from "vitest";
import {
  buildChatRequest,
  createLlmClient,
  LlmError,
  parseChatResponse,
  RATE_LIMIT_MESSAGE,
  sanitizeSchema,
  stripReasoning,
  type ChatMessage,
  type ToolDefinition,
} from "./llm";

const TOOLS: ToolDefinition[] = [
  {
    name: "search_entities",
    description: "Look up ids.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        take: { type: "integer", minimum: 1, maximum: 20 },
        nested: { type: "object", additionalProperties: false, properties: { title: { type: "string" } } },
      },
      required: ["query"],
    },
  },
];

const MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are a test." },
  { role: "user", content: "Go." },
];

function completion(message: Record<string, unknown>, finish_reason = "stop") {
  return { choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason }] };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

function clientWith(fetchImpl: typeof fetch, extra: Partial<Parameters<typeof createLlmClient>[0]> = {}) {
  return createLlmClient({
    apiKey: "test-key",
    baseUrl: "https://llm.example.test/v1/",
    model: "test-model",
    fetchImpl,
    sleep: async () => {},
    ...extra,
  });
}

describe("request building", () => {
  it("posts to {base}/chat/completions with tools, tool_choice auto and low temperature", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(completion({ content: "hi" })));
    await clientWith(fetchImpl as unknown as typeof fetch).chat(MESSAGES, TOOLS);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://llm.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("test-model");
    expect(body.tool_choice).toBe("auto");
    expect(body.temperature).toBeLessThanOrEqual(0.3);
    expect(body.messages).toEqual(MESSAGES);
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].type).toBe("function");
    expect(body.tools[0].function.name).toBe("search_entities");
    expect(body.tools[0].function.parameters.required).toEqual(["query"]);
    expect(body.tools[0].function.parameters.properties.take.maximum).toBe(20);
  });

  it("drops schema keywords providers reject but keeps a property that is named like one", () => {
    const cleaned = sanitizeSchema({
      type: "object",
      additionalProperties: false,
      properties: { title: { type: "string", title: "x" } },
    }) as { additionalProperties?: unknown; properties: Record<string, Record<string, unknown>> };
    expect(cleaned.additionalProperties).toBeUndefined();
    expect(cleaned.properties.title).toEqual({ type: "string" });
  });

  it("omits tools and tool_choice when no tools are given", () => {
    const body = buildChatRequest("m", MESSAGES, [], 0.2);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
  });
});

describe("response parsing", () => {
  it("returns tool calls in order, including parallel calls", () => {
    const reply = parseChatResponse(
      completion(
        {
          content: null,
          tool_calls: [
            { id: "a1", type: "function", function: { name: "search_entities", arguments: '{"query":"one"}' } },
            { id: "a2", type: "function", function: { name: "search_entities", arguments: '{"query":"two"}' } },
          ],
        },
        "tool_calls",
      ),
    );
    expect(reply.toolCalls.map((c) => [c.id, c.argumentsText])).toEqual([
      ["a1", '{"query":"one"}'],
      ["a2", '{"query":"two"}'],
    ]);
    expect(reply.assistantMessage.tool_calls).toHaveLength(2);
    expect(reply.assistantMessage.content).toBeNull();
  });

  it("invents unique ids when the provider omits them or repeats them", () => {
    const reply = parseChatResponse(
      completion({
        tool_calls: [
          { function: { name: "search_entities", arguments: '{"query":"one"}' } },
          { function: { name: "search_entities", arguments: '{"query":"two"}' } },
          { id: "dup", function: { name: "search_entities", arguments: "{}" } },
          { id: "dup", function: { name: "search_entities", arguments: "{}" } },
        ],
      }),
    );
    const ids = reply.toolCalls.map((c) => c.id);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(4);
    expect(reply.assistantMessage.tool_calls?.map((c) => c.id)).toEqual(ids);
  });

  it("keeps the raw argument text of malformed calls but sends valid JSON back in the history", () => {
    const reply = parseChatResponse(
      completion({
        tool_calls: [{ id: "x", function: { name: "search_entities", arguments: '{"query": "oops"' } }],
      }),
    );
    expect(reply.toolCalls[0].argumentsText).toBe('{"query": "oops"');
    expect(reply.assistantMessage.tool_calls?.[0].function.arguments).toBe("{}");
  });

  it("accepts arguments sent as an object instead of a string", () => {
    const reply = parseChatResponse(
      completion({ tool_calls: [{ id: "x", function: { name: "search_entities", arguments: { query: "a" } } }] }),
    );
    expect(JSON.parse(reply.toolCalls[0].argumentsText)).toEqual({ query: "a" });
  });

  it("preserves provider-specific fields on tool calls so they can be sent back", () => {
    const reply = parseChatResponse(
      completion({
        tool_calls: [
          {
            id: "x",
            function: { name: "search_entities", arguments: "{}" },
            extra_content: { google: { thought_signature: "sig" } },
          },
        ],
      }),
    );
    expect(reply.assistantMessage.tool_calls?.[0]).toMatchObject({ extra_content: { google: { thought_signature: "sig" } } });
  });

  it("strips reasoning from the visible text and never echoes reasoning fields", () => {
    const reply = parseChatResponse(
      completion({
        content: "<think>secret plan</think>Looking up places.",
        reasoning: "more secret",
        reasoning_content: "even more",
      }),
    );
    expect(reply.text).toBe("Looking up places.");
    expect(JSON.stringify(reply.assistantMessage)).not.toMatch(/secret|even more/);
    expect(stripReasoning("<think>never closed")).toBe("");
  });

  it("reads content sent as an array of parts and skips reasoning parts", () => {
    const reply = parseChatResponse(
      completion({
        content: [
          { type: "thinking", text: "hidden" },
          { type: "text", text: "Visible." },
        ],
      }),
    );
    expect(reply.text).toBe("Visible.");
  });

  it("rejects a body without choices", () => {
    expect(() => parseChatResponse({ choices: [] })).toThrow(LlmError);
    expect(() => parseChatResponse(null)).toThrow(LlmError);
  });
});

describe("retries, errors and timeout", () => {
  it("retries a 429 using Retry-After and then succeeds", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "slow down" } }, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse(completion({ content: "ok" })));
    const reply = await clientWith(fetchImpl as unknown as typeof fetch, { sleep }).chat(MESSAGES, TOOLS);
    expect(reply.text).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("uses exponential backoff when there is no Retry-After header", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse(completion({ content: "ok" })));
    await clientWith(fetchImpl as unknown as typeof fetch, { sleep }).chat(MESSAGES, TOOLS);
    expect(sleep.mock.calls.map((c) => (c as unknown as number[])[0])).toEqual([2000, 4000]);
  });

  it("gives up after three tries with a rate limit message", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "quota" } }, 429));
    const promise = clientWith(fetchImpl as unknown as typeof fetch, { sleep }).chat(MESSAGES, TOOLS);
    await expect(promise).rejects.toMatchObject({ kind: "rate_limit", message: RATE_LIMIT_MESSAGE });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not wait when Retry-After is longer than the wait budget", async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429, { "Retry-After": "120" }));
    await expect(clientWith(fetchImpl as unknown as typeof fetch, { sleep }).chat(MESSAGES, TOOLS)).rejects.toMatchObject({
      kind: "rate_limit",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("times out a request that never answers", async () => {
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    const promise = clientWith(fetchImpl as unknown as typeof fetch, { timeoutMs: 25 }).chat(MESSAGES, TOOLS);
    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
    await expect(promise).rejects.toThrow(/did not answer within/);
  });

  it("maps 401 to a key error without leaking the key", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "bad key test-key" } }, 401));
    const err = await clientWith(fetchImpl as unknown as typeof fetch).chat(MESSAGES, TOOLS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).kind).toBe("auth");
    expect((err as LlmError).message).not.toContain("test-key");
  });

  it("reads Gemini style error arrays on a 400", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ error: { code: 400, message: "Function call is missing a thought_signature" } }], 400));
    await expect(clientWith(fetchImpl as unknown as typeof fetch).chat(MESSAGES, TOOLS)).rejects.toThrow(
      /HTTP 400: Function call is missing a thought_signature/,
    );
  });

  it("reports a network failure plainly", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(clientWith(fetchImpl as unknown as typeof fetch).chat(MESSAGES, TOOLS)).rejects.toMatchObject({ kind: "network" });
  });
});
