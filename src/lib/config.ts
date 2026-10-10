// Server-only. Reads environment variables. Never import this from client components.

export interface AppConfig {
  demo: boolean;
  qlooBaseUrl: string;
  qlooApiKey: string | null;
  llmApiKey: string | null;
  /** Base URL of an OpenAI-compatible Chat Completions API, without a trailing slash. */
  llmBaseUrl: string;
  llmModel: string;
  /** DEBUG_QLOO=1 logs response key names (never values) server-side. */
  debugQloo: boolean;
}

const DEFAULT_QLOO_BASE_URL = "https://hackathon.api.qloo.com";
// Default is Google's Gemini API through its OpenAI-compatible endpoint. See docs/MODEL_PROVIDERS.md.
const DEFAULT_LLM_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_LLM_MODEL = "gemini-3.5-flash-lite";

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getConfig(): AppConfig {
  const qlooApiKey = readEnv("QLOO_API_KEY");
  const llmApiKey = readEnv("LLM_API_KEY");
  return {
    // Demo mode runs whenever either key is missing, so the UI never mixes live and sample data silently.
    demo: qlooApiKey === null || llmApiKey === null,
    qlooBaseUrl: readEnv("QLOO_BASE_URL") ?? DEFAULT_QLOO_BASE_URL,
    qlooApiKey,
    llmApiKey,
    llmBaseUrl: (readEnv("LLM_BASE_URL") ?? DEFAULT_LLM_BASE_URL).replace(/\/+$/, ""),
    llmModel: readEnv("LLM_MODEL") ?? DEFAULT_LLM_MODEL,
    debugQloo: readEnv("DEBUG_QLOO") === "1",
  };
}
