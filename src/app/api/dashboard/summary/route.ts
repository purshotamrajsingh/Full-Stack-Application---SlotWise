import { NextRequest } from "next/server";
import { handle, ok, query } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { buildDashboard } from "@/lib/analytics";

/** GET /api/dashboard/summary?range=30 — admin analytics (KPIs + all series). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const range = Number(query(req).get("range") ?? 30);
    const data = await buildDashboard(Number.isNaN(range) ? 30 : range);
    return ok(data);
  });
}
