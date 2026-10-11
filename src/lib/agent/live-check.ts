// Helpers for the live model check in scripts/live-llm-check.live.test.ts.
// Developer tooling only: the app never imports this file. Nothing here touches the network by itself,
// and nothing prints or stores the key.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { parseTemperature, parseThinking } from "../config";
import type { ThinkingSwitch, TokenUsage } from "./llm";

export type ProviderName = "gemini" | "deepseek";

export interface ProviderSettings {
  provider: ProviderName;
  baseUrl: string;
  model: string;
  temperature: number | null;
  thinking: ThinkingSwitch | null;
}

/** Presets for LIVE_PROVIDER. LLM_BASE_URL, LLM_MODEL, LLM_TEMPERATURE and LLM_THINKING override them. */
const PRESETS: Record<ProviderName, Omit<ProviderSettings, "provider">> = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.5-flash-lite",
    // Google advises leaving Gemini 3 at its default temperature.
    temperature: null,
    thinking: null,
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-flash",
    temperature: null,
    // Thinking is on by default at DeepSeek. Off is faster and cheaper for a tool loop.
    thinking: "disabled",
  },
};

export function resolveProvider(env: Record<string, string | undefined>): ProviderSettings {
  const raw = (env.LIVE_PROVIDER ?? "gemini").trim().toLowerCase();
  if (raw !== "gemini" && raw !== "deepseek") {
    throw new Error(`LIVE_PROVIDER must be gemini or deepseek (got "${raw}").`);
  }
  const preset = PRESETS[raw];
  const pick = (name: string) => env[name]?.trim() || null;
  const temperatureEnv = pick("LLM_TEMPERATURE");
  const thinkingEnv = pick("LLM_THINKING");
  return {
    provider: raw,
    baseUrl: (pick("LLM_BASE_URL") ?? preset.baseUrl).replace(/\/+$/, ""),
    model: pick("LLM_MODEL") ?? preset.model,
    temperature: temperatureEnv === null ? preset.temperature : parseTemperature(temperatureEnv),
    thinking: thinkingEnv === null ? preset.thinking : parseThinking(thinkingEnv),
  };
}

/** Reads a positive integer from the environment, falling back when it is missing or invalid. */
export function intFromEnv(value: string | undefined, fallback: number, min = 1, max = 1000): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/**
 * Reads the model key from a file. Accepts a bare key on the first non-empty line, or a line such as
 * LLM_API_KEY=... . The returned value must never be printed. Errors name the path, not the contents.
 */
export function readKeyFile(path: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): string {
  const expanded = path.startsWith("~/") ? `${homedir()}${path.slice(1)}` : path;
  let text: string;
  try {
    text = read(expanded);
  } catch {
    throw new Error(`Could not read the key file at ${expanded}. Check the path in LLM_KEY_FILE.`);
  }
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("#"));
  if (!line) throw new Error(`The key file at ${expanded} is empty.`);
  const value = line.replace(/^(export\s+)?[A-Z_]+_API_KEY\s*=\s*/, "").replace(/^["']|["']$/g, "").trim();
  if (value === "" || /\s/.test(value)) {
    throw new Error(`The key file at ${expanded} should hold the key alone on its first line.`);
  }
  if (value === "[SENSITIVE]") throw new Error(`The key file at ${expanded} holds a placeholder, not a key.`);
  return value;
}

/** Removes every occurrence of the key from text that is about to be printed. */
export function redact(text: string, key: string): string {
  return key === "" ? text : text.split(key).join("[key]");
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class BudgetExceeded extends Error {
  constructor(max: number) {
    super(`LIVE_MAX_REQUESTS (${max}) reached. Stopping before sending another request.`);
    this.name = "BudgetExceeded";
  }
}

export class QuotaExhausted extends Error {
  constructor(detail: string) {
    super(`The provider reports an exhausted daily quota. Stopping. ${detail}`);
    this.name = "QuotaExhausted";
  }
}

export interface RequestRecord {
  at: number;
  status: number;
  usage: TokenUsage | null;
  durationMs: number;
}

const RATE_HEADER = /rate|limit|quota|retry/i;
const DAILY_QUOTA = /per[\s_-]?day|daily|requests_per_day|RequestsPerDay/i;

/**
 * Wraps fetch for the live check: spaces requests apart, counts every request (retries included),
 * refuses to exceed a budget, records rate-limit headers and token usage, and stops the whole check
 * when the provider says the daily quota is gone. The key is never read here.
 */
export class RequestGate {
  readonly records: RequestRecord[] = [];
  readonly rateLimitHeaders = new Map<string, string>();
  readonly rateLimitErrors: string[] = [];
  /** Time spent waiting for the minimum interval. Excluded from "net" wall-clock figures. */
  paceWaitedMs = 0;
  private lastStart = 0;
  private stopped: QuotaExhausted | null = null;

  constructor(
    private readonly options: {
      maxRequests: number;
      minIntervalMs: number;
      key: string;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  get count(): number {
    return this.records.length;
  }

  /** Why no further request will be sent, or null while the check can continue. */
  get haltReason(): string | null {
    if (this.stopped) return this.stopped.message;
    if (this.records.length >= this.options.maxRequests) return new BudgetExceeded(this.options.maxRequests).message;
    return null;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  private async sleep(ms: number): Promise<void> {
    if (this.options.sleep) return this.options.sleep(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  wrap(inner: typeof fetch): typeof fetch {
    return (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (this.stopped) throw this.stopped;
      if (this.records.length >= this.options.maxRequests) throw new BudgetExceeded(this.options.maxRequests);
      const wait = this.lastStart === 0 ? 0 : this.lastStart + this.options.minIntervalMs - this.now();
      if (wait > 0) {
        this.paceWaitedMs += wait;
        await this.sleep(wait);
      }
      this.lastStart = this.now();
      const started = this.lastStart;
      // Count before sending, so a failed or timed-out request still uses budget.
      const record: RequestRecord = { at: started, status: 0, usage: null, durationMs: 0 };
      this.records.push(record);
      const response = await inner(input, init);
      record.status = response.status;
      record.durationMs = this.now() - started;
      await this.inspect(response, record);
      return response;
    }) as typeof fetch;
  }

  private async inspect(response: Response, record: RequestRecord): Promise<void> {
    response.headers.forEach((value, name) => {
      if (RATE_HEADER.test(name) && !/authorization/i.test(name)) {
        this.rateLimitHeaders.set(name.toLowerCase(), redact(value, this.options.key));
      }
    });
    let text = "";
    try {
      text = await response.clone().text();
    } catch {
      return;
    }
    if (response.status === 429) {
      const snippet = redact(text.replace(/\s+/g, " ").trim(), this.options.key).slice(0, 400);
      this.rateLimitErrors.push(snippet);
      if (DAILY_QUOTA.test(snippet)) this.stopped = new QuotaExhausted(snippet.slice(0, 200));
      return;
    }
    try {
      const body = JSON.parse(text) as { usage?: Record<string, unknown> };
      const u = body.usage;
      if (u && typeof u === "object") {
        const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
        const completion = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
        const total = typeof u.total_tokens === "number" ? u.total_tokens : prompt + completion;
        record.usage = { promptTokens: prompt, completionTokens: completion, totalTokens: total };
      }
    } catch {
      // Not JSON. Nothing to record.
    }
  }

  tokensSince(startIndex: number): { prompt: number; completion: number; total: number; reported: boolean } {
    let prompt = 0;
    let completion = 0;
    let total = 0;
    let reported = false;
    for (const r of this.records.slice(startIndex)) {
      if (!r.usage) continue;
      reported = true;
      prompt += r.usage.promptTokens;
      completion += r.usage.completionTokens;
      total += r.usage.totalTokens;
    }
    return { prompt, completion, total, reported };
  }
}

export interface RunSummary {
  kind: "shortlist" | "promo";
  ok: boolean;
  /** Why the run failed, or a note on a run that passed. */
  note: string;
  turns: number;
  requests: number;
  /** Wall-clock including pacing waits. */
  grossMs: number;
  /** Wall-clock without the waits this tool added between requests. */
  netMs: number;
  tokens: { prompt: number; completion: number; total: number; reported: boolean };
}

export interface KindSummary {
  kind: "shortlist" | "promo";
  runs: number;
  valid: number;
  medianTurns: number | null;
  medianRequests: number | null;
  medianNetSeconds: number | null;
  maxNetSeconds: number | null;
  medianTotalTokens: number | null;
  medianPromptTokens: number | null;
  medianCompletionTokens: number | null;
}

export function summariseKind(kind: "shortlist" | "promo", runs: RunSummary[]): KindSummary {
  const mine = runs.filter((r) => r.kind === kind);
  const tokenRuns = mine.filter((r) => r.tokens.reported);
  const netSeconds = mine.map((r) => r.netMs / 1000);
  return {
    kind,
    runs: mine.length,
    valid: mine.filter((r) => r.ok).length,
    medianTurns: median(mine.map((r) => r.turns)),
    medianRequests: median(mine.map((r) => r.requests)),
    medianNetSeconds: median(netSeconds),
    maxNetSeconds: netSeconds.length > 0 ? Math.max(...netSeconds) : null,
    medianTotalTokens: median(tokenRuns.map((r) => r.tokens.total)),
    medianPromptTokens: median(tokenRuns.map((r) => r.tokens.prompt)),
    medianCompletionTokens: median(tokenRuns.map((r) => r.tokens.completion)),
  };
}

function cell(value: number | null, digits = 0): string {
  return value === null ? "n/a" : value.toFixed(digits);
}

export function formatSummaryTable(rows: KindSummary[]): string {
  const header = ["kind", "valid", "median turns", "median requests", "median seconds", "max seconds", "median tokens (in/out)"];
  const body = rows.map((r) => [
    r.kind,
    `${r.valid}/${r.runs}`,
    cell(r.medianTurns, 1),
    cell(r.medianRequests, 1),
    cell(r.medianNetSeconds, 1),
    cell(r.maxNetSeconds, 1),
    r.medianTotalTokens === null
      ? "n/a"
      : `${cell(r.medianTotalTokens)} (${cell(r.medianPromptTokens)}/${cell(r.medianCompletionTokens)})`,
  ]);
  const all = [header, ...body];
  const widths = header.map((_, i) => Math.max(...all.map((row) => row[i].length)));
  const line = (row: string[]) => row.map((c, i) => c.padEnd(widths[i])).join("  ");
  return [line(header), widths.map((w) => "-".repeat(w)).join("  "), ...body.map(line)].join("\n");
}

/** Requests one user session costs: a shortlist plus one promo plan, using medians. */
export function sessionRequests(shortlist: KindSummary, promo: KindSummary): number | null {
  if (shortlist.medianRequests === null || promo.medianRequests === null) return null;
  return shortlist.medianRequests + promo.medianRequests;
}

/** Sessions per day a request quota supports, rounded down. */
export function sessionsPerDay(dailyRequests: number, requestsPerSession: number): number {
  return requestsPerSession > 0 ? Math.floor(dailyRequests / requestsPerSession) : 0;
}

/** The live check passes when the schema request worked and at least two thirds of runs of each kind were valid. */
export function verdict(schemaOk: boolean, rows: KindSummary[]): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!schemaOk) reasons.push("The provider did not accept the schema request.");
  for (const r of rows) {
    if (r.runs === 0) reasons.push(`No ${r.kind} runs completed.`);
    else if (r.valid / r.runs < 2 / 3) reasons.push(`Only ${r.valid} of ${r.runs} ${r.kind} runs were valid.`);
  }
  return { pass: reasons.length === 0, reasons };
}
