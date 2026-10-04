import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";
import { isWithinAvailability, LEAD_MIN } from "@/lib/slots";

const rescheduleSchema = z.object({
  startAt: z.string().min(10),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * DELETE /api/bookings/:id — cancels a booking.
 * Customers can cancel their own PENDING/CONFIRMED bookings; providers can
 * cancel their own schedule items; admins can cancel anything.
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireSession(req);
    const { id } = await ctx.params;

    const booking = await db.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");

    const isOwner = session.role === "CUSTOMER" && booking.customerId === session.id;
    const isOwnProvider =
      session.role === "PROVIDER" && session.providerId === booking.providerId;
    const isAdmin = session.role === "ADMIN";
    if (!isOwner && !isOwnProvider && !isAdmin) {
      throw new HttpError(403, "FORBIDDEN", "You can only cancel your own bookings.");
    }
    if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
      throw new HttpError(
        400,
        "BAD_STATE",
        "Only pending or confirmed bookings can be cancelled.",
      );
    }

    const updated = await db.booking.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: bookingInclude,
    });
    return ok({ booking: toBookingDTO(updated) });
  });
}

/**
 * PATCH /api/bookings/:id — reschedules (customer, own booking only).
 * Runs the same transactional overlap guard as creation, excluding itself.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const { id } = await ctx.params;
    const body = rescheduleSchema.parse(await readJson(req));

    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid start time.");
    }

    const updated = await db.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id },
        include: { service: true },
      });
      if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");
      if (booking.customerId !== session.id) {
        throw new HttpError(403, "FORBIDDEN", "You can only reschedule your own bookings.");
      }
      if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
        throw new HttpError(
          400,
          "BAD_STATE",
          "Only pending or confirmed bookings can be rescheduled.",
        );
      }

      const endAt = new Date(startAt.getTime() + booking.service.durationMin * 60_000);

      if (startAt.getTime() < Date.now() + LEAD_MIN * 60_000) {
        throw new HttpError(
          400,
          "TOO_SOON",
          `Reschedules need at least ${LEAD_MIN} minutes of lead time.`,
        );
      }

      const availability = await tx.availability.findMany({
        where: { providerId: booking.providerId },
      });
      if (!isWithinAvailability(availability, startAt, endAt)) {
        throw new HttpError(
          400,
          "OUTSIDE_AVAILABILITY",
          "That time is outside the provider's working hours.",
        );
      }

      const startOfDay = new Date(
        Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()),
      );
      const busy = await tx.booking.findMany({
        where: {
          providerId: booking.providerId,
          status: { in: ["PENDING", "CONFIRMED"] },
          id: { not: booking.id },
          startAt: { lt: new Date(startOfDay.getTime() + 86_400_000) },
          endAt: { gt: startOfDay },
        },
        select: { startAt: true, endAt: true },
      });
      if (busy.some((b) => b.startAt < endAt && b.endAt > startAt)) {
        throw new HttpError(
          409,
          "SLOT_TAKEN",
          "That slot is already taken. Please pick another time.",
        );
      }

      return tx.booking.update({
        where: { id: booking.id },
        data: { startAt, endAt },
        include: bookingInclude,
      });
    });

    return ok({ booking: toBookingDTO(updated) });
  });
}
