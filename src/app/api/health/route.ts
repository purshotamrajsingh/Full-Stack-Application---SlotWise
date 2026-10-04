import { handle, ok } from "@/lib/api";
import { db } from "@/lib/db";

/** GET /api/health — liveness probe. */
export async function GET() {
  return handle(async () => {
    await db.user.count();
    return ok({ status: "ok", time: new Date().toISOString() });
  });
}
