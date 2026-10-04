import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, query, readJson, HttpError } from "@/lib/api";
import { getSession, requireSession, hashPassword } from "@/lib/auth";
import { enrichProvider } from "@/lib/services";
import { EMAIL_RE } from "@/lib/services";

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().regex(EMAIL_RE, "Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(100),
  bio: z.string().trim().max(500).optional(),
  specialty: z.string().trim().max(80).optional(),
  serviceIds: z.array(z.string()).optional(),
});

/**
 * GET /api/providers — public staff directory with search.
 * Query: q (name/specialty/service), all=1 (admin: include inactive).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const params = query(req);
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const session = await getSession(req);
    const includeInactive =
      params.get("all") === "1" && session?.role === "ADMIN";

    const providers = await db.provider.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        user: { select: { name: true, email: true } },
        services: { include: { service: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    let enriched = await Promise.all(providers.map(enrichProvider));

    if (q) {
      enriched = enriched.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.specialty.toLowerCase().includes(q) ||
          p.services.some((s) => s.name.toLowerCase().includes(q)),
      );
    }

    return ok({ items: enriched, total: enriched.length });
  });
}

/** POST /api/providers — admin only: provisions a staff account. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const body = createSchema.parse(await readJson(req));
    const email = body.email.trim().toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "EMAIL_TAKEN", "A user with this email already exists.");
    }

    if (body.serviceIds && body.serviceIds.length > 0) {
      const services = await db.service.count({
        where: { id: { in: body.serviceIds } },
      });
      if (services !== body.serviceIds.length) {
        throw new HttpError(400, "BAD_SERVICES", "One or more service IDs are invalid.");
      }
    }

    const created = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: body.name.trim(),
          email,
          passwordHash: await hashPassword(body.password),
          role: "PROVIDER",
        },
      });
      const provider = await tx.provider.create({
        data: {
          userId: user.id,
          bio: body.bio ?? "",
          specialty: body.specialty ?? "",
          services:
            body.serviceIds && body.serviceIds.length > 0
              ? {
                  create: body.serviceIds.map((serviceId) => ({ serviceId })),
                }
              : undefined,
        },
        include: {
          user: true,
          services: { include: { service: true } },
        },
      });
      return provider;
    });

    return ok({ provider: await enrichProvider(created) }, 201);
  });
}
