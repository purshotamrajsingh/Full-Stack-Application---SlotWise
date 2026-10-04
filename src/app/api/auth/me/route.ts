import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson } from "@/lib/api";
import { requireSession, toUserDTO } from "@/lib/auth";
import { isValidTimezone } from "@/lib/tz";

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

const patchSchema = z.object({
  timezone: z.string().trim().min(1).max(64),
});

/**
 * PATCH /api/auth/me — set the signed-in customer's display timezone.
 * Customers only: staff calendars (diary, availability editor, admin
 * exports) are pinned to business-UTC, so their views never shift.
 */
export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const body = patchSchema.parse(await readJson(req));
    if (!isValidTimezone(body.timezone)) {
      return ok({
        user: toUserDTO(
          await db.user.findUniqueOrThrow({
            where: { id: session.id },
            include: { provider: { select: { id: true } } },
          }),
        ),
        note: "Unrecognised timezone — kept the previous one.",
      });
    }

    const user = await db.user.update({
      where: { id: session.id },
      data: { timezone: body.timezone },
      include: { provider: { select: { id: true } } },
    });
    return ok({ user: toUserDTO(user) });
  });
}
