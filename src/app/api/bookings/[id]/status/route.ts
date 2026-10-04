import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";
import { emitBookingEvent, emitSlotsChanged } from "@/lib/realtime";

const statusSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"]),
});

/** Allowed status transitions — enforced server-side. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/**
 * PATCH /api/bookings/:id/status — provider (own booking) or admin.
 * Powers the "confirm / complete / mark no-show" workflow.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const { id } = await ctx.params;
    const body = statusSchema.parse(await readJson(req));

    const booking = await db.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");

    if (
      session.role === "PROVIDER" &&
      booking.providerId !== session.providerId
    ) {
      throw new HttpError(403, "FORBIDDEN", "You can only update your own bookings.");
    }

    if (!TRANSITIONS[booking.status]?.includes(body.status)) {
      throw new HttpError(
        400,
        "INVALID_TRANSITION",
        `Cannot move a ${booking.status.toLowerCase()} booking to ${body.status.toLowerCase()}.`,
      );
    }

    const updated = await db.booking.update({
      where: { id },
      data: { status: body.status },
      include: bookingInclude,
    });
    const dto = toBookingDTO(updated);
    emitBookingEvent("booking:status", dto, { id: session.id, name: session.name }, updated.provider.userId);
    if (body.status === "CANCELLED") emitSlotsChanged(dto); // freed a slot
    return ok({ booking: dto });
  });
}
