import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";
import { isWithinAvailability, LEAD_MIN } from "@/lib/slots";
import { emitBookingEvent, emitSlotsChanged } from "@/lib/realtime";
import { notifyBookingCancelled, notifyBookingRescheduled } from "@/lib/notifications";
import { notifyFreedSlot } from "@/lib/waitlist";

const updateSchema = z
  .object({
    startAt: z.string().min(10).optional(),
    notes: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.startAt !== undefined || v.notes !== undefined, {
    message: "Provide a new startAt or notes.",
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
    const dto = toBookingDTO(updated);
    emitBookingEvent("booking:cancelled", dto, { id: session.id, name: session.name }, updated.provider.userId);
    emitSlotsChanged(dto); // freed a slot
    notifyBookingCancelled(dto, updated.provider.userId).catch(() => {}); // mock email to provider
    // Waitlist: anyone watching this window gets a one-shot "slot opened" ping.
    notifyFreedSlot(booking.providerId, booking.startAt, booking.endAt).catch(() => {});
    return ok({ booking: dto });
  });
}

/**
 * PATCH /api/bookings/:id — update a customer's own booking.
 *
 * Two modes on one endpoint:
 *  - `{ startAt }` (optionally with `notes`) → reschedule. Runs the same
 *    transactional overlap guard as creation, excluding itself.
 *  - `{ notes }` only → edit the booking note (PENDING/CONFIRMED only).
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const { id } = await ctx.params;
    const body = updateSchema.parse(await readJson(req));

    // Notes-only edit: no time math, no overlap guard needed.
    if (body.startAt === undefined) {
      const booking = await db.booking.findUnique({
        where: { id },
        include: bookingInclude,
      });
      if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");
      if (booking.customerId !== session.id) {
        throw new HttpError(403, "FORBIDDEN", "You can only edit your own bookings.");
      }
      if (!["PENDING", "CONFIRMED"].includes(booking.status)) {
        throw new HttpError(
          400,
          "BAD_STATE",
          "Notes can only be edited while the booking is pending or confirmed.",
        );
      }
      const updated = await db.booking.update({
        where: { id },
        data: { notes: body.notes && body.notes.length > 0 ? body.notes : null },
        include: bookingInclude,
      });
      const dto = toBookingDTO(updated);
      emitBookingEvent("booking:updated", dto, { id: session.id, name: session.name }, updated.provider.userId);
      return ok({ booking: dto });
    }

    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid start time.");
    }

    // The window the booking is leaving — freed for waitlist watchers.
    const freed = { start: new Date(0), end: new Date(0) };

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

      freed.start = booking.startAt;
      freed.end = booking.endAt;

      return tx.booking.update({
        where: { id: booking.id },
        data: {
          startAt,
          endAt,
          ...(body.notes !== undefined
            ? { notes: body.notes && body.notes.length > 0 ? body.notes : null }
            : {}),
        },
        include: bookingInclude,
      });
    });

    const dto = toBookingDTO(updated);
    emitBookingEvent("booking:rescheduled", dto, { id: session.id, name: session.name }, updated.provider.userId);
    emitSlotsChanged(dto); // old slot freed, new slot taken
    notifyBookingRescheduled(dto, updated.provider.userId).catch(() => {}); // mock email to provider
    // Waitlist: the window the booking moved away from is now free.
    if (freed.start.getTime() > 0) {
      notifyFreedSlot(updated.providerId, freed.start, freed.end).catch(() => {});
    }
    return ok({ booking: dto });
  });
}
