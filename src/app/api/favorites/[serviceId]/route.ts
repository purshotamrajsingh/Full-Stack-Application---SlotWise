import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/**
 * DELETE /api/favorites/:serviceId — unheart a service (own favorites only).
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ serviceId: string }> },
) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const { serviceId } = await ctx.params;

    const existing = await db.favorite.findUnique({
      where: { userId_serviceId: { userId: session.id, serviceId } },
      select: { id: true },
    });
    if (!existing) {
      throw new HttpError(404, "NOT_FOUND", "That service is not in your favorites.");
    }

    await db.favorite.delete({ where: { id: existing.id } });
    return ok({ serviceId });
  });
}
