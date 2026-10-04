import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/** POST /api/notifications/read-all — mark every notification as read. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req);
    const result = await db.notification.updateMany({
      where: { userId: session.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ updated: result.count });
  });
}
