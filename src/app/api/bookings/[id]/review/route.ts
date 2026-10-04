import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

/** POST /api/bookings/:id/review — customer reviews their completed booking. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireSession(req, ["CUSTOMER"]);
    const { id } = await ctx.params;
    const body = reviewSchema.parse(await readJson(req));

    const booking = await db.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");

    if (booking.customerId !== session.id) {
      throw new HttpError(403, "FORBIDDEN", "You can only review your own bookings.");
    }
    if (booking.status !== "COMPLETED") {
      throw new HttpError(400, "BAD_STATE", "Only completed bookings can be reviewed.");
    }
    if (booking.review) {
      throw new HttpError(409, "ALREADY_REVIEWED", "You have already reviewed this booking.");
    }

    await db.review.create({
      data: {
        bookingId: booking.id,
        authorId: session.id,
        rating: body.rating,
        comment: body.comment || null,
      },
    });

    const refreshed = await db.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    return ok({ booking: refreshed ? toBookingDTO(refreshed) : null }, 201);
  });
}
