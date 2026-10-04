import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const createSchema = z.object({
  serviceId: z.string().min(1),
});

/**
 * GET /api/favorites — the signed-in customer's hearted service IDs,
 * oldest heart first.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const rows = await db.favorite.findMany({
      where: { userId: session.id },
      orderBy: { createdAt: "asc" },
      select: { serviceId: true },
    });
    return ok({ items: rows.map((r) => r.serviceId) });
  });
}

/**
 * POST /api/favorites — heart a service (customer-only). Idempotent-ish:
 * re-hearting an already-favorited service returns 200 alreadyFavorite
 * instead of tripping the unique constraint.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const body = createSchema.parse(await readJson(req));

    const service = await db.service.findUnique({
      where: { id: body.serviceId },
      select: { isActive: true },
    });
    if (!service) {
      throw new HttpError(400, "UNKNOWN_SERVICE", "That service does not exist.");
    }
    if (!service.isActive) {
      throw new HttpError(
        400,
        "INACTIVE_SERVICE",
        "That service is not currently bookable.",
      );
    }

    const existing = await db.favorite.findUnique({
      where: { userId_serviceId: { userId: session.id, serviceId: body.serviceId } },
      select: { id: true },
    });
    if (existing) {
      return ok({ serviceId: body.serviceId, alreadyFavorite: true });
    }

    await db.favorite.create({
      data: { userId: session.id, serviceId: body.serviceId },
    });
    return ok({ serviceId: body.serviceId, alreadyFavorite: false }, 201);
  });
}
