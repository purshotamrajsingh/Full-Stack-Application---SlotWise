import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { WaitlistDTO } from "@/lib/types";

const MAX_ACTIVE_WATCHES = 10;
const MAX_WATCH_AHEAD_DAYS = 60;
const DAY_MS = 86_400_000;

const createSchema = z.object({
  providerId: z.string().min(1),
  serviceId: z.string().min(1),
  startAt: z.string().min(10),
  endAt: z.string().min(10),
});

function toDto(
  w: {
    id: string;
    startAt: Date;
    endAt: Date;
    notifiedAt: Date | null;
    createdAt: Date;
    serviceId: string;
    providerId: string;
    service: { name: string; category: string; price: number; durationMin: number };
    provider: { user: { name: string } };
  },
): WaitlistDTO {
  return {
    id: w.id,
    startAt: w.startAt.toISOString(),
    endAt: w.endAt.toISOString(),
    serviceId: w.serviceId,
    serviceName: w.service.name,
    category: w.service.category,
    providerId: w.providerId,
    providerName: w.provider.user.name,
    price: w.service.price,
    durationMin: w.service.durationMin,
    notifiedAt: w.notifiedAt ? w.notifiedAt.toISOString() : null,
    createdAt: w.createdAt.toISOString(),
  };
}

const waitlistInclude = {
  service: { select: { name: true, category: true, price: true, durationMin: true } },
  provider: { include: { user: { select: { name: true } } } },
} as const;

/**
 * GET /api/waitlist — the signed-in customer's slot watchlist.
 * Ordered by watched start time; notified entries included for history.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req);
    const rows = await db.waitlist.findMany({
      where: { userId: session.id, startAt: { gte: new Date(Date.now() - DAY_MS) } },
      orderBy: { startAt: "asc" },
      take: 50,
      include: waitlistInclude,
    });
    return ok({ items: rows.map(toDto) });
  });
}

/**
 * POST /api/waitlist — watch a taken slot ("tell me the moment it frees").
 * Customer-only. One-shot: when the slot frees, the entry flips to notified
 * and the watcher gets a notification (see lib/waitlist.ts).
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const body = createSchema.parse(await readJson(req));

    const startAt = new Date(body.startAt);
    const endAt = new Date(body.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid slot times.");
    }
    if (endAt <= startAt) {
      throw new HttpError(400, "BAD_WINDOW", "The slot must end after it starts.");
    }
    if (endAt.getTime() - startAt.getTime() > 8 * 3_600_000) {
      throw new HttpError(400, "TOO_LONG", "Watched slots can be at most 8 hours long.");
    }
    if (startAt.getTime() < Date.now()) {
      throw new HttpError(400, "IN_PAST", "That slot is already in the past.");
    }
    if (startAt.getTime() > Date.now() + MAX_WATCH_AHEAD_DAYS * DAY_MS) {
      throw new HttpError(
        400,
        "TOO_FAR",
        `Slots at most ${MAX_WATCH_AHEAD_DAYS} days ahead can be watched.`,
      );
    }

    // Provider must exist, be active, and actually offer this service.
    const link = await db.providerService.findUnique({
      where: { providerId_serviceId: { providerId: body.providerId, serviceId: body.serviceId } },
      include: { provider: { select: { isActive: true } }, service: { select: { isActive: true } } },
    });
    if (!link || !link.provider.isActive || !link.service.isActive) {
      throw new HttpError(
        404,
        "NOT_FOUND",
        "This provider does not offer the requested service.",
      );
    }

    // The watched window must genuinely be held by a booking (customers can
    // only watch slots that are currently unavailable because they're taken).
    const taken = await db.booking.findFirst({
      where: {
        providerId: body.providerId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (!taken) {
      throw new HttpError(
        409,
        "NOT_TAKEN",
        "That slot is not held by a booking — you can book it directly.",
      );
    }

    // The watcher must not already hold a booking there themselves.
    const own = await db.booking.findFirst({
      where: {
        customerId: session.id,
        providerId: body.providerId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true },
    });
    if (own) {
      throw new HttpError(
        400,
        "ALREADY_BOOKED",
        "You already have a booking in that window.",
      );
    }

    // One watch per user + provider + start time.
    const duplicate = await db.waitlist.findUnique({
      where: {
        userId_providerId_startAt: {
          userId: session.id,
          providerId: body.providerId,
          startAt,
        },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new HttpError(409, "ALREADY_WATCHING", "You're already watching that slot.");
    }

    // Cap concurrent active watches.
    const activeCount = await db.waitlist.count({
      where: { userId: session.id, notifiedAt: null, startAt: { gte: new Date() } },
    });
    if (activeCount >= MAX_ACTIVE_WATCHES) {
      throw new HttpError(
        400,
        "LIMIT",
        `You can watch at most ${MAX_ACTIVE_WATCHES} slots at once. Remove one first.`,
      );
    }

    const created = await db.waitlist.create({
      data: {
        userId: session.id,
        providerId: body.providerId,
        serviceId: body.serviceId,
        startAt,
        endAt,
      },
      include: waitlistInclude,
    });

    return ok({ entry: toDto(created) }, 201);
  });
}
