import { getConfig } from "@/lib/config";
import type { AppStatus } from "@/lib/types/stagehand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/status: reports demo mode and the model in use. Never returns keys. */
export function GET() {
  const config = getConfig();
  let qlooHost = "unknown";
  try {
    qlooHost = new URL(config.qlooBaseUrl).host;
  } catch {
    qlooHost = "invalid QLOO_BASE_URL";
  }
  const status: AppStatus = {
    demo: config.demo,
    model: config.llmModel,
    qlooHost,
  };
  return Response.json(status);
}
