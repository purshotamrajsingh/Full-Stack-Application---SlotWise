import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireSession, toUserDTO } from "@/lib/auth";

/** GET /api/auth/me — current session profile (used on app bootstrap). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req);
    const user = await db.user.findUnique({
      where: { id: session.id },
      include: { provider: { select: { id: true } } },
    });
    return ok({ user: user ? toUserDTO(user) : null });
  });
}
