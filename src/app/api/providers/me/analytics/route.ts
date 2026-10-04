import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import type { ProviderAnalyticsDTO } from "@/lib/types";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const RANGE_DAYS = 30;
const WEEKS = 8;

/** Monday 00:00 UTC of the week containing `d`. */
function startOfWeekUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff),
  );
}

function weekLabel(start: Date): string {
  return `${start.getUTCDate()} ${start.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  })}`;
}

/**
 * GET /api/providers/me/analytics — the provider portal's Insights tab.
 * Aggregates the signed-in provider's last 30 days + weekly history.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER"]);
    if (!session.providerId) {
      throw new HttpError(400, "NO_PROVIDER_PROFILE", "No provider profile linked.");
    }
    const providerId = session.providerId;

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const since30 = new Date(today.getTime() - (RANGE_DAYS - 1) * DAY_MS);

    const [bookings, reviews, upcoming, availability] = await Promise.all([
      db.booking.findMany({
        where: {
          providerId,
          startAt: { gte: since30, lt: new Date(today.getTime() + DAY_MS) },
        },
        include: { service: { select: { name: true, category: true, price: true } } },
      }),
      db.review.findMany({
        where: { booking: { providerId } },
        select: { rating: true },
      }),
      db.booking.count({
        where: {
          providerId,
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { gte: now },
        },
      }),
      db.availability.findMany({ where: { providerId } }),
    ]);

    const active = bookings.filter((b) => b.status !== "CANCELLED");
    const completed = bookings.filter((b) => b.status === "COMPLETED");

    // KPIs — revenue, volume, rating, utilization, repeat share, pipeline.
    const revenue30 = completed.reduce((s, b) => s + b.service.price, 0);
    const ratingSum = reviews.reduce((s, r) => s + r.rating, 0);
    const rating = reviews.length > 0 ? ratingSum / reviews.length : 0;

    // Utilization = booked minutes / open minutes over the window (the
    // current weekly availability projected backwards — documented approximation).
    let openMin = 0;
    for (let i = 0; i < RANGE_DAYS; i++) {
      const day = new Date(since30.getTime() + i * DAY_MS);
      for (const w of availability) {
        if (w.weekday === day.getUTCDay()) openMin += w.endMin - w.startMin;
      }
    }
    const bookedMin = active.reduce(
      (s, b) => s + (b.endAt.getTime() - b.startAt.getTime()) / 60_000,
      0,
    );
    const utilizationPct =
      openMin > 0 ? Math.min(100, Math.round((bookedMin / openMin) * 100)) : 0;

    // Repeat-customer share (distinct customers with 2+ bookings in range).
    const perCustomer = new Map<string, number>();
    for (const b of active) {
      perCustomer.set(b.customerId, (perCustomer.get(b.customerId) ?? 0) + 1);
    }
    const repeatCustomerPct =
      perCustomer.size > 0
        ? Math.round(
            ([...perCustomer.values()].filter((n) => n > 1).length /
              perCustomer.size) *
              100,
          )
        : null;

    // Weekly series — last 8 Monday-start weeks, zero-filled.
    const thisWeek = startOfWeekUtc(today);
    const weekly: ProviderAnalyticsDTO["weekly"] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const start = new Date(thisWeek.getTime() - w * WEEK_MS);
      const end = new Date(start.getTime() + WEEK_MS);
      const inWeek = active.filter(
        (b) => b.startAt >= start && b.startAt < end,
      );
      const weekCompleted = inWeek.filter((b) => b.status === "COMPLETED");
      weekly.push({
        label: weekLabel(start),
        startISO: start.toISOString(),
        bookings: inWeek.length,
        completed: weekCompleted.length,
        noShows: inWeek.filter((b) => b.status === "NO_SHOW").length,
        revenue:
          Math.round(weekCompleted.reduce((s, b) => s + b.service.price, 0) * 100) /
          100,
      });
    }

    // Service mix — top 6 by completed revenue.
    const svcMap = new Map<
      string,
      { service: string; category: string; bookings: number; revenue: number }
    >();
    for (const b of active) {
      const entry =
        svcMap.get(b.serviceId) ??
        { service: b.service.name, category: b.service.category, bookings: 0, revenue: 0 };
      entry.bookings += 1;
      if (b.status === "COMPLETED") entry.revenue += b.service.price;
      svcMap.set(b.serviceId, entry);
    }
    const serviceMix = [...svcMap.values()]
      .map((v) => ({
        ...v,
        revenue: Math.round(v.revenue * 100) / 100,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Status mix over the window.
    const statusMix = (
      ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const
    ).map((status) => ({
      status,
      count: bookings.filter((b) => b.status === status).length,
    }));

    const result: ProviderAnalyticsDTO = {
      kpis: {
        revenue30: Math.round(revenue30 * 100) / 100,
        bookings30: active.length,
        rating: Math.round(rating * 10) / 10,
        reviewCount: reviews.length,
        utilizationPct,
        repeatCustomerPct,
        upcoming,
      },
      weekly,
      serviceMix,
      statusMix,
    };

    return ok(result);
  });
}
