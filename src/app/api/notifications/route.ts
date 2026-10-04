import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/notifications — the signed-in user's mock outbox.
 * Query: ?limit=20 (5–50). Response: items + unread count.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req);
    const params = query(req);
    const limit = Math.min(
      50,
      Math.max(5, Number.parseInt(params.get("limit") ?? "", 10) || 20),
    );

    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: session.id },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      db.notification.count({ where: { userId: session.id, readAt: null } }),
    ]);

    return ok({
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        bookingId: n.bookingId,
        readAt: n.readAt ? n.readAt.toISOString() : null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread,
    });
  });
}
