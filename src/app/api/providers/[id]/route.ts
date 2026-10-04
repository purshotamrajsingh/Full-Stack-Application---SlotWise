import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { getSession, requireSession } from "@/lib/auth";
import { enrichProvider } from "@/lib/services";

const updateSchema = z.object({
  bio: z.string().trim().max(500).optional(),
  specialty: z.string().trim().max(80).optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(z.string()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/providers/:id — public provider profile.
 * Includes weekly availability + the 10 most recent reviews.
 * Email is only exposed to admins (staff management).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const { id } = await ctx.params;
    const session = await getSession(req);

    const [provider, availability, reviews] = await Promise.all([
      db.provider.findUnique({
        where: { id },
        include: {
          user: { select: { name: true, email: true } },
          services: { include: { service: true } },
        },
      }),
      db.availability.findMany({
        where: { providerId: id },
        orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
      }),
      db.review.findMany({
        where: { booking: { providerId: id } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          author: { select: { name: true } },
          repliedBy: { select: { name: true } },
          booking: { include: { service: { select: { name: true } } } },
        },
      }),
    ]);
    if (!provider) throw new HttpError(404, "NOT_FOUND", "Provider not found.");

    const enriched = await enrichProvider(provider);

    return ok({
      provider: {
        ...enriched,
        ...(session?.role === "ADMIN" ? { email: enriched.email } : { email: undefined }),
        availability: availability.map((a) => ({
          weekday: a.weekday,
          startMin: a.startMin,
          endMin: a.endMin,
        })),
        reviews: reviews.map((r) => ({
          rating: r.rating,
          comment: r.comment,
          createdAt: r.createdAt.toISOString(),
          authorName: r.author.name,
          serviceName: r.booking.service.name,
          reply: r.reply,
          repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
          repliedByName: r.repliedBy ? r.repliedBy.name : null,
        })),
      },
    });
  });
}

/** PATCH /api/providers/:id — admin only. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const { id } = await ctx.params;
    const body = updateSchema.parse(await readJson(req));

    const existing = await db.provider.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Provider not found.");

    if (body.serviceIds) {
      const services = await db.service.count({
        where: { id: { in: body.serviceIds } },
      });
      if (services !== body.serviceIds.length) {
        throw new HttpError(400, "BAD_SERVICES", "One or more service IDs are invalid.");
      }
    }

    const updated = await db.$transaction(async (tx) => {
      if (body.serviceIds) {
        await tx.providerService.deleteMany({ where: { providerId: id } });
        if (body.serviceIds.length > 0) {
          await tx.providerService.createMany({
            data: body.serviceIds.map((serviceId) => ({ providerId: id, serviceId })),
          });
        }
      }
      return tx.provider.update({
        where: { id },
        data: {
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.specialty !== undefined ? { specialty: body.specialty } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: {
          user: true,
          services: { include: { service: true } },
        },
      });
    });

    return ok({ provider: await enrichProvider(updated) });
  });
}
