import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { issueTokenPair, toUserDTO, verifyRefreshToken } from "@/lib/auth";

const bodySchema = z.object({
  refreshToken: z.string().min(20, "Missing refresh token."),
});

/** POST /api/auth/refresh — rotates the token pair when the access token expires. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = bodySchema.parse(await readJson(req));

    const userId = await verifyRefreshToken(body.refreshToken);
    if (!userId) {
      throw new HttpError(
        401,
        "INVALID_REFRESH",
        "Your session has expired. Please sign in again.",
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { provider: { select: { id: true } } },
    });
    if (!user) {
      throw new HttpError(401, "INVALID_REFRESH", "Account no longer exists.");
    }

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as "ADMIN" | "PROVIDER" | "CUSTOMER",
      providerId: user.provider?.id ?? null,
    };
    const tokens = await issueTokenPair(sessionUser);

    return ok({ user: toUserDTO(user), ...tokens });
  });
}
