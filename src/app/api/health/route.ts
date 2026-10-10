export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health: liveness check. Returns no configuration and no secrets. */
export function GET() {
  return Response.json({ ok: true });
}
