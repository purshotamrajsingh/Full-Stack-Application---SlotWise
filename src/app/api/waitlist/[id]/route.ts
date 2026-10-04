import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/**
 * DELETE /api/waitlist/:id — stop watching a slot (own entries only).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const session = await requireSession(req);
    const { id } = await ctx.params;

    const entry = await db.waitlist.findUnique({ where: { id } });
    if (!entry || entry.userId !== session.id) {
      throw new HttpError(404, "NOT_FOUND", "Watchlist entry not found.");
    }

    await db.waitlist.delete({ where: { id } });
    return ok({ deleted: true });
  });
}
