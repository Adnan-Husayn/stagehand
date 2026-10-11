import { describe, expect, it, vi } from "vitest";
import {
  BudgetExceeded,
  formatSummaryTable,
  intFromEnv,
  median,
  QuotaExhausted,
  readKeyFile,
  redact,
  RequestGate,
  resolveProvider,
  sessionRequests,
  sessionsPerDay,
  summariseKind,
  verdict,
  type RunSummary,
} from "./live-check";

const FAKE_KEY = "fake-test-key-123";

describe("resolveProvider", () => {
  it("defaults to the Gemini preset with no temperature", () => {
    expect(resolveProvider({})).toEqual({
      provider: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash-lite",
      temperature: null,
      thinking: null,
    });
  });

  it("uses the DeepSeek preset with thinking off", () => {
    expect(resolveProvider({ LIVE_PROVIDER: "deepseek" })).toMatchObject({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-flash",
      thinking: "disabled",
    });
  });

  it("lets environment variables override the preset", () => {
    const settings = resolveProvider({
      LIVE_PROVIDER: "deepseek",
      LLM_BASE_URL: "https://example.test/v1/",
      LLM_MODEL: "other-model",
      LLM_TEMPERATURE: "0.3",
      LLM_THINKING: "enabled",
    });
    expect(settings).toMatchObject({ baseUrl: "https://example.test/v1", model: "other-model", temperature: 0.3, thinking: "enabled" });
  });

  it("rejects an unknown provider", () => {
    expect(() => resolveProvider({ LIVE_PROVIDER: "other" })).toThrow(/gemini or deepseek/);
  });
});

describe("intFromEnv", () => {
  it("falls back on missing or invalid values", () => {
    expect(intFromEnv(undefined, 3)).toBe(3);
    expect(intFromEnv("", 3)).toBe(3);
    expect(intFromEnv("abc", 3)).toBe(3);
    expect(intFromEnv("0", 3)).toBe(3);
    expect(intFromEnv("5", 3)).toBe(5);
  });
});

describe("readKeyFile", () => {
  it("reads a bare key and a KEY=value line, ignoring comments and blank lines", () => {
    expect(readKeyFile("/x", () => `\n# note\n  ${FAKE_KEY}  \n`)).toBe(FAKE_KEY);
    expect(readKeyFile("/x", () => `LLM_API_KEY="${FAKE_KEY}"\n`)).toBe(FAKE_KEY);
    expect(readKeyFile("/x", () => `export GEMINI_API_KEY=${FAKE_KEY}`)).toBe(FAKE_KEY);
  });

  it("fails without echoing file contents", () => {
    expect(() => readKeyFile("/missing", () => { throw new Error(`secret ${FAKE_KEY}`); })).toThrow(/Could not read the key file at \/missing/);
    try {
      readKeyFile("/missing", () => { throw new Error(`secret ${FAKE_KEY}`); });
    } catch (err) {
      expect(String(err)).not.toContain(FAKE_KEY);
    }
    expect(() => readKeyFile("/x", () => "  \n")).toThrow(/empty/);
    expect(() => readKeyFile("/x", () => "two words here")).toThrow(/alone on its first line/);
    expect(() => readKeyFile("/x", () => "[SENSITIVE]")).toThrow(/placeholder/);
  });
});

describe("redact and median", () => {
  it("removes the key wherever it appears", () => {
    expect(redact(`a ${FAKE_KEY} b ${FAKE_KEY}`, FAKE_KEY)).toBe("a [key] b [key]");
    expect(redact("plain", "")).toBe("plain");
  });

  it("computes medians", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

describe("RequestGate", () => {
  it("counts requests, paces them and records usage and rate-limit headers", async () => {
    let clock = 1_000;
    const sleep = vi.fn(async (ms: number) => {
      clock += ms;
    });
    const inner = vi.fn(async () =>
      response(
        200,
        { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } },
        { "x-ratelimit-remaining-requests": "42", "content-type": "application/json", authorization: "never" },
      ),
    );
    const gate = new RequestGate({ maxRequests: 10, minIntervalMs: 4000, key: FAKE_KEY, now: () => clock, sleep });
    const wrapped = gate.wrap(inner as unknown as typeof fetch);
    await wrapped("https://x.test");
    await wrapped("https://x.test");
    expect(gate.count).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(gate.paceWaitedMs).toBe(4000);
    expect(gate.rateLimitHeaders.get("x-ratelimit-remaining-requests")).toBe("42");
    expect(gate.rateLimitHeaders.has("authorization")).toBe(false);
    expect(gate.tokensSince(0)).toEqual({ prompt: 200, completion: 40, total: 240, reported: true });
    expect(gate.tokensSince(1).total).toBe(120);
  });

  it("refuses to exceed the request budget", async () => {
    const inner = vi.fn(async () => response(200, { choices: [] }));
    const gate = new RequestGate({ maxRequests: 2, minIntervalMs: 0, key: FAKE_KEY, sleep: async () => {} });
    const wrapped = gate.wrap(inner as unknown as typeof fetch);
    await wrapped("https://x.test");
    await wrapped("https://x.test");
    expect(gate.haltReason).toMatch(/LIVE_MAX_REQUESTS \(2\)/);
    await expect(wrapped("https://x.test")).rejects.toBeInstanceOf(BudgetExceeded);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(gate.count).toBe(2);
  });

  it("stops everything after a daily quota error and redacts the key from recorded errors", async () => {
    const inner = vi.fn(async () =>
      response(429, { error: { message: `Quota exceeded for metric requests per day for ${FAKE_KEY}` } }),
    );
    const gate = new RequestGate({ maxRequests: 10, minIntervalMs: 0, key: FAKE_KEY, sleep: async () => {} });
    const wrapped = gate.wrap(inner as unknown as typeof fetch);
    const first = await wrapped("https://x.test");
    expect(first.status).toBe(429);
    expect(gate.rateLimitErrors.join(" ")).not.toContain(FAKE_KEY);
    expect(gate.haltReason).toMatch(/daily quota/);
    await expect(wrapped("https://x.test")).rejects.toBeInstanceOf(QuotaExhausted);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("keeps going after a per-minute 429", async () => {
    const inner = vi
      .fn()
      .mockResolvedValueOnce(response(429, { error: { message: "Too many requests per minute" } }))
      .mockResolvedValueOnce(response(200, { choices: [] }));
    const gate = new RequestGate({ maxRequests: 10, minIntervalMs: 0, key: FAKE_KEY, sleep: async () => {} });
    const wrapped = gate.wrap(inner as unknown as typeof fetch);
    await wrapped("https://x.test");
    const second = await wrapped("https://x.test");
    expect(second.status).toBe(200);
    expect(gate.count).toBe(2);
    expect(gate.haltReason).toBeNull();
  });
});

function run(partial: Partial<RunSummary>): RunSummary {
  return {
    kind: "shortlist",
    ok: true,
    note: "",
    turns: 8,
    requests: 8,
    grossMs: 40_000,
    netMs: 30_000,
    tokens: { prompt: 9000, completion: 1000, total: 10_000, reported: true },
    ...partial,
  };
}

describe("summaries", () => {
  const runs = [
    run({}),
    run({ turns: 10, requests: 10, netMs: 50_000, tokens: { prompt: 12_000, completion: 2000, total: 14_000, reported: true } }),
    run({ ok: false, turns: 14, requests: 14, netMs: 90_000 }),
    run({ kind: "promo", turns: 7, requests: 7, netMs: 20_000 }),
  ];

  it("summarises one kind", () => {
    const s = summariseKind("shortlist", runs);
    expect(s).toMatchObject({ runs: 3, valid: 2, medianTurns: 10, medianRequests: 10, medianNetSeconds: 50, maxNetSeconds: 90 });
    expect(s.medianTotalTokens).toBe(10_000);
  });

  it("handles a kind with no runs", () => {
    const s = summariseKind("promo", []);
    expect(s).toMatchObject({ runs: 0, valid: 0, medianTurns: null, medianNetSeconds: null });
  });

  it("formats a table and estimates a session", () => {
    const shortlist = summariseKind("shortlist", runs);
    const promo = summariseKind("promo", runs);
    const table = formatSummaryTable([shortlist, promo]);
    expect(table).toContain("shortlist");
    expect(table).toContain("2/3");
    expect(table).toContain("1/1");
    expect(sessionRequests(shortlist, promo)).toBe(17);
    expect(sessionsPerDay(500, 17)).toBe(29);
    expect(sessionsPerDay(500, 0)).toBe(0);
    expect(sessionRequests(summariseKind("shortlist", []), promo)).toBeNull();
  });

  it("passes only when the schema request worked and two thirds of runs were valid", () => {
    const good = [summariseKind("shortlist", [run({}), run({}), run({ ok: false })]), summariseKind("promo", [run({ kind: "promo" })])];
    expect(verdict(true, good).pass).toBe(true);
    expect(verdict(false, good).pass).toBe(false);
    const bad = [summariseKind("shortlist", [run({ ok: false }), run({ ok: false }), run({})]), summariseKind("promo", [])];
    const result = verdict(true, bad);
    expect(result.pass).toBe(false);
    expect(result.reasons).toHaveLength(2);
  });
});
