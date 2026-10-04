import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { emitTimeOffChanged } from "@/lib/realtime";

/**
 * DELETE /api/providers/me/time-off/:id — remove a time-off window.
 * Open booking dialogs refresh the affected days over the realtime channel.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const { id } = await ctx.params;
    const params = query(req);

    let providerId: string;
    if (session.role === "ADMIN") {
      providerId = params.get("providerId") ?? session.providerId ?? "";
    } else {
      providerId = session.providerId ?? "";
    }

    const existing = await db.timeOff.findUnique({ where: { id } });
    if (!existing || (providerId && existing.providerId !== providerId)) {
      throw new HttpError(404, "NOT_FOUND", "Time-off window not found.");
    }

    await db.timeOff.delete({ where: { id } });
    emitTimeOffChanged(existing.providerId, existing.startAt, existing.endAt);

    return ok({ deleted: true });
  });
}
