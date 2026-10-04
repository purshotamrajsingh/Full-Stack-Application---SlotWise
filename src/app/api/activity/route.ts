import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query } from "@/lib/api";

/**
 * GET /api/activity — public, privacy-safe "recent bookings" feed for the
 * landing page ticker. Returns what was booked and with whom, but never
 * who booked it.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const params = query(req);
    const limit = Math.min(10, Math.max(1, Number.parseInt(params.get("limit") ?? "8", 10) || 8));

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const now = new Date();
    const window = {
      createdAt: { gte: since, lte: now },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
    };
    const [recent, count24h] = await Promise.all([
      db.booking.findMany({
        where: window,
        orderBy: { createdAt: "desc" },
        take: 30,
        include: {
          service: { select: { name: true, category: true, price: true } },
          provider: { select: { user: { select: { name: true } } } },
        },
      }),
      db.booking.count({ where: window }),
    ]);

    // De-duplicate identical service+provider pairs so the ticker feels varied.
    const seen = new Set<string>();
    const items = recent
      .filter((b) => {
        const key = `${b.service.name}|${b.provider.user.name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, limit)
      .map((b) => ({
        id: b.id,
        service: b.service.name,
        category: b.service.category,
        providerName: b.provider.user.name,
        price: b.service.price,
        createdAt: b.createdAt.toISOString(),
        startAt: b.startAt.toISOString(),
      }));

    return ok({ items, count24h });
  });
}
