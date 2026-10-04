import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { ProviderReviewItem } from "@/lib/types";

const replySchema = z.object({
  reply: z
    .string()
    .trim()
    .min(3, "Replies must be at least 3 characters.")
    .max(500, "Replies must be at most 500 characters."),
});

/** Everything needed to serialise a review with its business reply. */
const replyInclude = {
  author: { select: { name: true } },
  repliedBy: { select: { name: true } },
  booking: {
    include: { service: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ReviewInclude;

type ReviewWithReply = Prisma.ReviewGetPayload<{ include: typeof replyInclude }>;

function toReviewItem(r: ReviewWithReply): ProviderReviewItem {
  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    reply: r.reply,
    repliedAt: r.repliedAt ? r.repliedAt.toISOString() : null,
    repliedByName: r.repliedBy ? r.repliedBy.name : null,
    authorName: r.author.name,
    serviceName: r.booking.service.name,
    serviceId: r.booking.service.id,
    bookingStartAt: r.booking.startAt.toISOString(),
  };
}

/** Loads the review + booking, enforcing provider scope (admins see all). */
async function loadReviewForReply(
  req: NextRequest,
  id: string,
): Promise<{ session: Awaited<ReturnType<typeof requireSession>>; review: ReviewWithReply }> {
  const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
  const review = await db.review.findUnique({ where: { id }, include: replyInclude });
  if (!review) throw new HttpError(404, "NOT_FOUND", "Review not found.");
  // Providers may only touch reviews on bookings they delivered.
  if (session.role === "PROVIDER" && review.booking.providerId !== session.providerId) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "You can only reply to reviews on your own bookings.",
    );
  }
  return { session, review };
}

/**
 * POST /api/reviews/:id/reply — post or replace the business reply.
 * Providers may only reply to reviews on their own bookings; admins may
 * reply to any review. Re-posting replaces the previous reply (201 the
 * first time, 200 when replacing).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { session, review } = await loadReviewForReply(req, id);
    const body = replySchema.parse(await readJson(req));

    const wasAnswered = review.reply !== null;
    await db.review.update({
      where: { id },
      data: {
        reply: body.reply,
        repliedAt: new Date(),
        repliedById: session.id,
      },
    });

    const updated = await db.review.findUnique({ where: { id }, include: replyInclude });
    if (!updated) throw new HttpError(404, "NOT_FOUND", "Review not found.");
    return ok({ review: toReviewItem(updated) }, wasAnswered ? 200 : 201);
  });
}

/**
 * DELETE /api/reviews/:id/reply — remove the business reply.
 * Only the reply's author or an admin may delete it.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { session, review } = await loadReviewForReply(req, id);

    if (review.reply === null) {
      throw new HttpError(404, "NOT_FOUND", "This review has no reply to delete.");
    }
    if (session.role !== "ADMIN" && review.repliedById !== session.id) {
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only the reply's author or an admin can delete it.",
      );
    }

    await db.review.update({
      where: { id },
      data: { reply: null, repliedAt: null, repliedById: null },
    });

    const updated = await db.review.findUnique({ where: { id }, include: replyInclude });
    if (!updated) throw new HttpError(404, "NOT_FOUND", "Review not found.");
    return ok({ review: toReviewItem(updated) });
  });
}
