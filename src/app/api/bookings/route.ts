import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, query, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";
import { isWithinAvailability, LEAD_MIN } from "@/lib/slots";
import type { BookingStatus } from "@/lib/types";

const createSchema = z.object({
  serviceId: z.string().min(1),
  providerId: z.string().min(1),
  startAt: z.string().min(10),
  notes: z.string().trim().max(300).optional(),
});

/**
 * GET /api/bookings — role-scoped list.
 * Customers see their own bookings, providers see their schedule,
 * admins see everything. Filters: status, from, to, q, upcoming, sort.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req);
    const params = query(req);

    const where: Record<string, unknown> = {};
    if (session.role === "CUSTOMER") {
      where.customerId = session.id;
    } else if (session.role === "PROVIDER") {
      if (!session.providerId) {
        throw new HttpError(400, "NO_PROVIDER_PROFILE", "No provider profile linked to this account.");
      }
      where.providerId = session.providerId;
    } else {
      const providerParam = params.get("providerId");
      if (providerParam) where.providerId = providerParam;
    }

    const statusParam = params.get("status");
    if (statusParam) {
      const statuses = statusParam
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is BookingStatus =>
          ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(s),
        );
      if (statuses.length > 0) where.status = { in: statuses };
    }

    const from = params.get("from");
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      where.startAt = { ...(where.startAt as object), gte: new Date(`${from}T00:00:00.000Z`) };
    }
    const to = params.get("to");
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      const toEnd = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
      where.startAt = { ...(where.startAt as object), lt: toEnd };
    }
    if (params.get("upcoming") === "1") {
      where.startAt = { ...(where.startAt as object), gte: new Date() };
    }

    // Optional server-side pagination (used by the admin bookings table).
    // Omitted -> legacy unpaginated response shape (other views keep working).
    const rawPage = Math.max(1, Number.parseInt(params.get("page") ?? "", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(5, Number.parseInt(params.get("pageSize") ?? "", 10) || 20),
    );
    const paged = params.has("page");

    const bookings = await db.booking.findMany({
      where,
      include: bookingInclude,
      orderBy: { startAt: "desc" },
      take: paged ? 1000 : 300,
    });

    let items = bookings.map(toBookingDTO);

    const q = (params.get("q") ?? "").trim().toLowerCase();
    if (q) {
      items = items.filter(
        (b) =>
          b.serviceName.toLowerCase().includes(q) ||
          b.customerName.toLowerCase().includes(q) ||
          b.providerName.toLowerCase().includes(q),
      );
    }

    const sort = params.get("sort") ?? "date_desc";
    if (sort === "date_asc") items.sort((a, b) => a.startAt.localeCompare(b.startAt));
    else if (sort === "created_desc") items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else if (sort === "price_desc") items.sort((a, b) => b.price - a.price);
    else items.sort((a, b) => b.startAt.localeCompare(a.startAt));

    if (paged) {
      const total = items.length;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(Math.max(1, rawPage), pageCount);
      const start = (page - 1) * pageSize;
      return ok({
        items: items.slice(start, start + pageSize),
        total,
        page,
        pageSize,
        pageCount,
      });
    }

    return ok({ items, total: items.length });
  });
}

/**
 * POST /api/bookings — customer creates a booking.
 *
 * DOUBLE-BOOKING PREVENTION (the standout technical feature):
 * The overlap check and the INSERT run inside ONE interactive Prisma
 * transaction. SQLite serialises writers (single-writer lock), so no two
 * concurrent requests can both pass the check before either commits —
 * the SQLite equivalent of a PostgreSQL EXCLUDE constraint on a
 * tstzrange overlap. Second writer gets 409 SLOT_TAKEN.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const body = createSchema.parse(await readJson(req));

    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid start time.");
    }

    const created = await db.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id: body.serviceId },
      });
      if (!service || !service.isActive) {
        throw new HttpError(404, "NOT_FOUND", "Service not found or inactive.");
      }

      const link = await tx.providerService.findUnique({
        where: {
          providerId_serviceId: {
            providerId: body.providerId,
            serviceId: body.serviceId,
          },
        },
        include: { provider: true },
      });
      if (!link || !link.provider.isActive) {
        throw new HttpError(
          404,
          "NOT_FOUND",
          "This provider does not offer the selected service.",
        );
      }

      const endAt = new Date(startAt.getTime() + service.durationMin * 60_000);

      if (startAt.getTime() < Date.now() + LEAD_MIN * 60_000) {
        throw new HttpError(
          400,
          "TOO_SOON",
          `Bookings need at least ${LEAD_MIN} minutes of lead time.`,
        );
      }

      const availability = await tx.availability.findMany({
        where: { providerId: body.providerId },
      });
      if (!isWithinAvailability(availability, startAt, endAt)) {
        throw new HttpError(
          400,
          "OUTSIDE_AVAILABILITY",
          "That time is outside the provider's working hours.",
        );
      }

      // The critical overlap guard — runs inside the same transaction as the insert.
      const startOfDay = new Date(
        Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()),
      );
      const busy = await tx.booking.findMany({
        where: {
          providerId: body.providerId,
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { lt: new Date(startOfDay.getTime() + 86_400_000) },
          endAt: { gt: startOfDay },
        },
        select: { startAt: true, endAt: true },
      });
      if (busy.some((b) => b.startAt < endAt && b.endAt > startAt)) {
        throw new HttpError(
          409,
          "SLOT_TAKEN",
          "This slot has just been booked. Please pick another time.",
        );
      }

      return tx.booking.create({
        data: {
          customerId: session.id,
          providerId: body.providerId,
          serviceId: body.serviceId,
          startAt,
          endAt,
          status: "PENDING",
          notes: body.notes || null,
        },
        include: bookingInclude,
      });
    });

    return ok({ booking: toBookingDTO(created) }, 201);
  });
}
