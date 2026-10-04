import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { enrichServices, serviceInclude } from "@/lib/services";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  category: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(500).optional(),
  durationMin: z.coerce.number().int().min(15).max(480).optional(),
  price: z.coerce.number().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  providerIds: z.array(z.string()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/services/:id — admin only. */
export async function PUT(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const { id } = await ctx.params;
    const body = updateSchema.parse(await readJson(req));

    const existing = await db.service.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Service not found.");

    if (body.providerIds) {
      const providers = await db.provider.count({
        where: { id: { in: body.providerIds } },
      });
      if (providers !== body.providerIds.length) {
        throw new HttpError(400, "BAD_PROVIDERS", "One or more provider IDs are invalid.");
      }
    }

    const updated = await db.$transaction(async (tx) => {
      if (body.providerIds) {
        await tx.providerService.deleteMany({ where: { serviceId: id } });
        if (body.providerIds.length > 0) {
          await tx.providerService.createMany({
            data: body.providerIds.map((providerId) => ({
              providerId,
              serviceId: id,
            })),
          });
        }
      }
      return tx.service.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.durationMin !== undefined ? { durationMin: body.durationMin } : {}),
          ...(body.price !== undefined ? { price: body.price } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: serviceInclude,
      });
    });

    const [dto] = await enrichServices([updated]);
    return ok({ service: dto });
  });
}

/**
 * DELETE /api/services/:id — admin only.
 * Services with booking history are soft-deleted (deactivated) so analytics
 * stay intact; unused services are removed outright.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const { id } = await ctx.params;

    const existing = await db.service.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, "NOT_FOUND", "Service not found.");

    const bookings = await db.booking.count({ where: { serviceId: id } });
    if (bookings > 0) {
      await db.service.update({ where: { id }, data: { isActive: false } });
      return ok({
        deleted: false,
        message: "Service has booking history, so it was deactivated instead of deleted.",
      });
    }

    await db.$transaction(async (tx) => {
      await tx.providerService.deleteMany({ where: { serviceId: id } });
      await tx.service.delete({ where: { id } });
    });
    return ok({ deleted: true, message: "Service deleted." });
  });
}
