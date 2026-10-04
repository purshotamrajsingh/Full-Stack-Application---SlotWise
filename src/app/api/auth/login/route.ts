import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { issueTokenPair, toUserDTO, verifyPassword } from "@/lib/auth";
import { EMAIL_RE } from "@/lib/services";

const bodySchema = z.object({
  email: z.string().regex(EMAIL_RE, "Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

/** POST /api/auth/login — issues an access + refresh token pair. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = bodySchema.parse(await readJson(req));
    const email = body.email.trim().toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
      include: { provider: { select: { id: true } } },
    });

    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
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
