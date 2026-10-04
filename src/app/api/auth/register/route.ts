import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { hashPassword, issueTokenPair, toUserDTO } from "@/lib/auth";
import { EMAIL_RE } from "@/lib/services";

const bodySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").max(80),
  email: z.string().regex(EMAIL_RE, "Please enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(100),
});

/**
 * POST /api/auth/register — public sign-up.
 * Role is intentionally fixed to CUSTOMER: staff/admin accounts are provisioned
 * by an admin to prevent privilege escalation through self-registration.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = bodySchema.parse(await readJson(req));
    const email = body.email.trim().toLowerCase();
    const name = body.name.trim();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(
        409,
        "EMAIL_TAKEN",
        "An account with this email already exists.",
      );
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        passwordHash: await hashPassword(body.password),
        role: "CUSTOMER",
      },
      include: { provider: { select: { id: true } } },
    });

    const sessionUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as "CUSTOMER",
      providerId: null as string | null,
    };
    const tokens = await issueTokenPair(sessionUser);

    return ok({ user: toUserDTO(user), ...tokens }, 201);
  });
}
