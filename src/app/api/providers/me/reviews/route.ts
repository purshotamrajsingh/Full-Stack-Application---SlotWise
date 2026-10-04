import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { handle, ok, query, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { ProviderReviewItem } from "@/lib/types";

/** Everything needed to serialise a review with its business reply. */
const reviewInclude = {
  author: { select: { name: true } },
  repliedBy: { select: { name: true } },
  booking: {
    include: { service: { select: { id: true, name: true } } },
  },
} satisfies Prisma.ReviewInclude;

/**
 * GET /api/providers/me/reviews?limit=20 — the provider portal's Reviews
 * tab. Reviews on bookings the signed-in provider delivered, newest first,
 * each with its public business reply (if any).
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER"]);
    if (!session.providerId) {
      throw new HttpError(400, "NO_PROVIDER_PROFILE", "No provider profile linked.");
    }

    const limit = Math.min(
      Math.max(Number(query(req).get("limit") ?? 20) || 20, 5),
      50,
    );

    const reviews: Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>[] =
      await db.review.findMany({
        where: { booking: { providerId: session.providerId } },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: reviewInclude,
      });

    const items: ProviderReviewItem[] = reviews.map((r) => ({
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
    }));

    return ok({ items });
  });
}
