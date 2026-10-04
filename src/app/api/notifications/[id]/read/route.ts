import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/**
 * POST /api/notifications/:id/read — mark ONE notification as read.
 * Own notifications only; idempotent (already-read → still 200).
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession(req);
    const { id } = await ctx.params;

    const row = await db.notification.findUnique({ where: { id } });
    if (!row || row.userId !== session.id) {
      throw new HttpError(404, "NOT_FOUND", "Notification not found.");
    }

    if (row.readAt) return ok({ read: true, alreadyRead: true });

    const updated = await db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return ok({
      read: true,
      notification: {
        id: updated.id,
        readAt: updated.readAt ? updated.readAt.toISOString() : null,
      },
    });
  });
}
