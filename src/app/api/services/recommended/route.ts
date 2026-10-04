import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { enrichServices, serviceInclude } from "@/lib/services";

/**
 * GET /api/services/recommended — a small personalised shortlist.
 *
 * - Signed-in customer with favourites → same-category services they have
 *   NOT hearted yet, ranked by rating × review volume ("because you liked X").
 * - Everyone else (guests, no favourites, staff) → the top-rated services
 *   overall ("popular right now").
 *
 * Query: ?limit=4 (2–8, default 4).
 * Response: { items: ServiceDTO[], basis: "favorites" | "popular", reasons: Record<serviceId, string> }
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const params = query(req);
    const limit = Math.min(
      8,
      Math.max(2, Number.parseInt(params.get("limit") ?? "", 10) || 4),
    );

    const session = await getSession(req);

    // Rating × ln(1 + reviews): a 5.0 with 2 reviews shouldn't outrank a
    // 4.6 with 80.
    const score = (rating: number, reviews: number) => rating * Math.log1p(reviews);

    const [favorites, reviews] = await Promise.all([
      session
        ? db.favorite.findMany({
            where: { userId: session.id },
            include: { service: { select: { id: true, name: true, category: true } } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      db.review.findMany({
        select: { rating: true, booking: { select: { serviceId: true } } },
      }),
    ]);

    const svcScores = new Map<string, { sum: number; n: number }>();
    for (const r of reviews) {
      const s = svcScores.get(r.booking.serviceId) ?? { sum: 0, n: 0 };
      s.sum += r.rating;
      s.n += 1;
      svcScores.set(r.booking.serviceId, s);
    }
    const rated = (id: string) => {
      const s = svcScores.get(id);
      return { rating: s && s.n > 0 ? s.sum / s.n : 0, reviews: s?.n ?? 0 };
    };

    let basis: "favorites" | "popular" = "popular";
    const reasons: Record<string, string> = {};

    // Personalised branch: same categories as hearted services, minus the
    // hearted ones themselves.
    if (favorites.length > 0) {
      const heartedIds = new Set(favorites.map((f) => f.service.id));
      const categories = [...new Set(favorites.map((f) => f.service.category))];

      const candidates = await db.service.findMany({
        where: { isActive: true },
        include: serviceInclude,
      });
      const pool = candidates.filter(
        (s) =>
          !heartedIds.has(s.id) &&
          s.providers.length > 0 &&
          categories.includes(s.category),
      );

      if (pool.length > 0) {
        basis = "favorites";
        const ranked = pool
          .map((s) => ({ s, ...rated(s.id) }))
          .sort((a, b) => score(b.rating, b.reviews) - score(a.rating, a.reviews))
          .slice(0, limit);

        // Reason label: the first hearted service sharing the category.
        const heartedByCategory = new Map<string, string>();
        for (const f of favorites) {
          if (!heartedByCategory.has(f.service.category)) {
            heartedByCategory.set(f.service.category, f.service.name);
          }
        }

        const items = await enrichServices(
          ranked.map((r) => r.s),
          session?.role === "CUSTOMER" ? session.id : null,
        );
        for (const item of items) {
          reasons[item.id] = heartedByCategory.get(item.category) ?? "";
        }
        return ok({ items, basis, reasons });
      }
    }

    // Popular fallback: top-rated active, bookable services overall.
    const all = await db.service.findMany({
      where: { isActive: true },
      include: serviceInclude,
    });
    const ranked = all
      .filter((s) => s.providers.length > 0)
      .map((s) => ({ s, ...rated(s.id) }))
      .sort((a, b) => score(b.rating, b.reviews) - score(a.rating, a.reviews))
      .slice(0, limit);

    const items = await enrichServices(
      ranked.map((r) => r.s),
      session?.role === "CUSTOMER" ? session.id : null,
    );
    return ok({ items, basis, reasons });
  });
}
