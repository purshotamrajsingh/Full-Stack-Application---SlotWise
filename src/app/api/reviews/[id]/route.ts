import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude, toBookingDTO } from "@/lib/serialize";

/** Customers can refine or remove a review for this long after posting. */
const EDIT_WINDOW_MIN = 15;

const editSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(500).nullable().optional(),
});

function assertEditable(createdAt: Date) {
  const ageMin = (Date.now() - createdAt.getTime()) / 60_000;
  if (ageMin > EDIT_WINDOW_MIN) {
    throw new HttpError(
      403,
      "WINDOW_CLOSED",
      `Reviews can only be changed within ${EDIT_WINDOW_MIN} minutes of posting.`,
    );
  }
}

async function loadOwnReview(req: NextRequest, id: string) {
  const session = await requireSession(req, ["CUSTOMER"]);
  const review = await db.review.findUnique({
    where: { id },
    include: { booking: true },
  });
  if (!review) throw new HttpError(404, "NOT_FOUND", "Review not found.");
  if (review.authorId !== session.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only change your own reviews.");
  }
  return { session, review };
}

async function refreshedBooking(bookingId: string) {
  const refreshed = await db.booking.findUnique({
    where: { id: bookingId },
    include: bookingInclude,
  });
  return refreshed ? toBookingDTO(refreshed) : null;
}

/**
 * PUT /api/reviews/:id — edit your own review within the edit window.
 * The booking DTO in the response carries the refreshed rating/comment.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { review } = await loadOwnReview(req, id);
    assertEditable(review.createdAt);
    const body = editSchema.parse(await readJson(req));

    await db.review.update({
      where: { id },
      data: {
        rating: body.rating,
        comment: body.comment && body.comment.length > 0 ? body.comment : null,
      },
    });

    return ok({ booking: await refreshedBooking(review.bookingId) });
  });
}

/**
 * DELETE /api/reviews/:id — remove your own review within the edit window.
 * The booking becomes reviewable again.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { review } = await loadOwnReview(req, id);
    assertEditable(review.createdAt);

    await db.review.delete({ where: { id } });

    return ok({ booking: await refreshedBooking(review.bookingId) });
  });
}
