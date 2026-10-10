// Server-only. Reads environment variables. Never import this from client components.

export interface AppConfig {
  demo: boolean;
  qlooBaseUrl: string;
  qlooApiKey: string | null;
  anthropicApiKey: string | null;
  anthropicModel: string;
  /** DEBUG_QLOO=1 logs response key names (never values) server-side. */
  debugQloo: boolean;
}

const DEFAULT_QLOO_BASE_URL = "https://hackathon.api.qloo.com";
const DEFAULT_MODEL = "claude-sonnet-5-5";

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getConfig(): AppConfig {
  const qlooApiKey = readEnv("QLOO_API_KEY");
  const anthropicApiKey = readEnv("ANTHROPIC_API_KEY");
  return {
    // Demo mode runs whenever either key is missing, so the UI never mixes live and sample data silently.
    demo: qlooApiKey === null || anthropicApiKey === null,
    qlooBaseUrl: readEnv("QLOO_BASE_URL") ?? DEFAULT_QLOO_BASE_URL,
    qlooApiKey,
    anthropicApiKey,
    anthropicModel: readEnv("ANTHROPIC_MODEL") ?? DEFAULT_MODEL,
    debugQloo: readEnv("DEBUG_QLOO") === "1",
  };
}
