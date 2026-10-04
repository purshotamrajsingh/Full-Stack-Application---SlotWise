import { db } from "@/lib/db";
import { handle, ok, query } from "@/lib/api";

/**
 * GET /api/reviews/recent?limit=6 — public feed of the latest written
 * reviews (comment required), used for landing-page testimonials.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const limit = Math.min(
      Math.max(Number(query(req).get("limit") ?? 6) || 6, 1),
      12,
    );

    const reviews = await db.review.findMany({
      where: { comment: { not: null } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        author: { select: { name: true } },
        booking: {
          include: {
            service: { select: { name: true } },
            provider: { include: { user: { select: { name: true } } } },
          },
        },
      },
    });

    return ok({
      items: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        authorName: r.author.name,
        serviceName: r.booking.service.name,
        providerName: r.booking.provider.user.name,
      })),
    });
  });
}
