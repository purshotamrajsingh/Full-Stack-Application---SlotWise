import { db } from "@/lib/db";
import {
  bookingInclude,
  toBookingDTO,
  type BookingFull,
} from "@/lib/serialize";

export { bookingInclude };
export type { BookingFull };

export interface DashboardResult {
  range: number;
  kpis: {
    totalBookings: number;
    revenue: number;
    expectedRevenue: number;
    noShowRate: number;
    avgRating: number;
    activeCustomers: number;
    upcomingBookings: number;
    cancelRate: number;
    /** Previous-period comparison (same length, immediately before the range). */
    prevRevenue: number;
    prevTotalBookings: number;
    prevNoShowRate: number;
    revenueDeltaPct: number | null;
    bookingsDeltaPct: number | null;
    noShowDeltaPct: number | null;
  };
  bookingsPerDay: {
    date: string;
    label: string;
    bookings: number;
    revenue: number;
  }[];
  revenueTrend: {
    offset: number;
    label: string;
    current: number;
    previous: number;
  }[];
  revenueByService: {
    service: string;
    category: string;
    revenue: number;
    bookings: number;
  }[];
  peakHours: { hour: number; label: string; bookings: number }[];
  topProviders: {
    providerId: string;
    name: string;
    revenue: number;
    bookings: number;
    rating: number;
  }[];
  statusMix: { status: string; count: number }[];
  categoryMix: { category: string; revenue: number; bookings: number }[];
  recentBookings: ReturnType<typeof toBookingDTO>[];
}

const DAY_MS = 86_400_000;

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Aggregates all dashboard series for the last `rangeDays` days. */
export async function buildDashboard(rangeDays = 30): Promise<DashboardResult> {
  const range = Math.min(Math.max(rangeDays, 7), 120);
  const today = startOfTodayUtc();
  const from = new Date(today.getTime() - (range - 1) * DAY_MS);

  const [inRange, prevRange, upcoming, avgRatingAgg, allTimeCustomers, recent, reviews] =
    await Promise.all([
      db.booking.findMany({
        where: { startAt: { gte: from, lt: new Date(today.getTime() + DAY_MS) } },
        include: bookingInclude,
      }),
      db.booking.findMany({
        where: {
          startAt: {
            gte: new Date(from.getTime() - range * DAY_MS),
            lt: from,
          },
        },
        select: { status: true, startAt: true, service: { select: { price: true } } },
      }),
      db.booking.findMany({
        where: { startAt: { gte: new Date() }, status: { in: ["PENDING", "CONFIRMED"] } },
        select: { status: true, service: { select: { price: true } } },
      }),
      db.review.aggregate({ _avg: { rating: true }, _count: true }),
      db.booking.groupBy({
        by: ["customerId"],
        where: { startAt: { gte: from } },
      }),
      db.booking.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        include: bookingInclude,
      }),
      db.review.findMany({
        select: {
          rating: true,
          booking: { select: { providerId: true, serviceId: true } },
        },
      }),
    ]);

  const count = (status: string) =>
    inRange.filter((b) => b.status === status).length;

  const completed = inRange.filter((b) => b.status === "COMPLETED");
  const revenue = completed.reduce((s, b) => s + b.service.price, 0);
  const noShows = count("NO_SHOW");
  const cancelled = count("CANCELLED");
  const active = inRange.filter((b) => b.status !== "CANCELLED");
  const noShowRate =
    completed.length + noShows > 0
      ? (noShows / (completed.length + noShows)) * 100
      : 0;
  const cancelRate =
    inRange.length > 0 ? (cancelled / inRange.length) * 100 : 0;

  // Previous-period comparison (same length window immediately before `from`).
  const prevCompleted = prevRange.filter((b) => b.status === "COMPLETED");
  const prevRevenue = prevCompleted.reduce((s, b) => s + b.service.price, 0);
  const prevNoShows = prevRange.filter((b) => b.status === "NO_SHOW").length;
  const prevNoShowRate =
    prevCompleted.length + prevNoShows > 0
      ? (prevNoShows / (prevCompleted.length + prevNoShows)) * 100
      : 0;
  const pct = (curr: number, prev: number): number | null =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 1000) / 10 : null;

  // Bookings per day (zero-filled)
  const perDayMap = new Map<string, { bookings: number; revenue: number }>();
  for (const b of active) {
    const key = b.startAt.toISOString().slice(0, 10);
    const entry = perDayMap.get(key) ?? { bookings: 0, revenue: 0 };
    entry.bookings += 1;
    if (b.status === "COMPLETED") entry.revenue += b.service.price;
    perDayMap.set(key, entry);
  }
  const bookingsPerDay: DashboardResult["bookingsPerDay"] = [];
  for (let i = 0; i < range; i++) {
    const day = new Date(from.getTime() + i * DAY_MS);
    const key = day.toISOString().slice(0, 10);
    const entry = perDayMap.get(key) ?? { bookings: 0, revenue: 0 };
    bookingsPerDay.push({
      date: key,
      label: `${day.getUTCDate()} ${day.toLocaleString("en-GB", {
        month: "short",
        timeZone: "UTC",
      })}`,
      bookings: entry.bookings,
      revenue: entry.revenue,
    });
  }

  // Cumulative revenue trend: running completed revenue per day-offset,
  // current range overlaid with the equally long window before it.
  const dailyRevenue = (list: { status: string; startAt: Date; service: { price: number } }[]) => {
    const byOffset = new Map<number, number>();
    const base = list === inRange ? from : new Date(from.getTime() - range * DAY_MS);
    for (const b of list) {
      if (b.status !== "COMPLETED") continue;
      const idx = Math.floor(
        (b.startAt.getTime() - base.getTime()) / DAY_MS,
      );
      if (idx < 0 || idx >= range) continue;
      byOffset.set(idx, (byOffset.get(idx) ?? 0) + b.service.price);
    }
    let running = 0;
    const out: number[] = [];
    for (let i = 0; i < range; i++) {
      running += byOffset.get(i) ?? 0;
      out.push(running);
    }
    return out;
  };
  const currentCum = dailyRevenue(inRange);
  const previousCum = dailyRevenue(prevRange);
  const revenueTrend: DashboardResult["revenueTrend"] = [];
  for (let i = 0; i < range; i++) {
    const day = new Date(from.getTime() + i * DAY_MS);
    revenueTrend.push({
      offset: i + 1,
      label: `${day.getUTCDate()} ${day.toLocaleString("en-GB", {
        month: "short",
        timeZone: "UTC",
      })}`,
      current: Math.round(currentCum[i]! * 100) / 100,
      previous: Math.round(previousCum[i]! * 100) / 100,
    });
  }

  // Revenue by service
  const svcMap = new Map<string, { category: string; revenue: number; bookings: number }>();
  for (const b of active) {
    const entry =
      svcMap.get(b.serviceId) ??
      { category: b.service.category, revenue: 0, bookings: 0 };
    entry.bookings += 1;
    if (b.status === "COMPLETED") entry.revenue += b.service.price;
    svcMap.set(b.serviceId, entry);
  }
  const svcNames = new Map(inRange.map((b) => [b.serviceId, b.service.name]));
  const revenueByService = [...svcMap.entries()]
    .map(([id, v]) => ({
      service: svcNames.get(id) ?? id,
      category: v.category,
      revenue: Math.round(v.revenue * 100) / 100,
      bookings: v.bookings,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // Peak hours (07:00–21:00 zero-filled)
  const hourCounts = new Array(24).fill(0) as number[];
  for (const b of active) hourCounts[b.startAt.getUTCHours()] += 1;
  const peakHours = DashboardHours(hourCounts);

  // Top providers
  const ratingByProvider = new Map<string, { sum: number; n: number }>();
  for (const r of reviews) {
    const entry =
      ratingByProvider.get(r.booking.providerId) ?? { sum: 0, n: 0 };
    entry.sum += r.rating;
    entry.n += 1;
    ratingByProvider.set(r.booking.providerId, entry);
  }
  const provMap = new Map<
    string,
    { name: string; revenue: number; bookings: number }
  >();
  for (const b of inRange) {
    if (b.status === "CANCELLED") continue;
    const entry =
      provMap.get(b.providerId) ??
      { name: b.provider.user.name, revenue: 0, bookings: 0 };
    entry.bookings += 1;
    if (b.status === "COMPLETED") entry.revenue += b.service.price;
    provMap.set(b.providerId, entry);
  }
  const topProviders = [...provMap.entries()]
    .map(([id, v]) => {
      const r = ratingByProvider.get(id);
      return {
        providerId: id,
        name: v.name,
        revenue: Math.round(v.revenue * 100) / 100,
        bookings: v.bookings,
        rating: r && r.n > 0 ? Math.round((r.sum / r.n) * 10) / 10 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Status mix
  const statusMix = [
    "PENDING",
    "CONFIRMED",
    "COMPLETED",
    "CANCELLED",
    "NO_SHOW",
  ].map((status) => ({ status, count: count(status) }));

  // Category mix
  const catMap = new Map<string, { revenue: number; bookings: number }>();
  for (const b of active) {
    const entry = catMap.get(b.service.category) ?? { revenue: 0, bookings: 0 };
    entry.bookings += 1;
    if (b.status === "COMPLETED") entry.revenue += b.service.price;
    catMap.set(b.service.category, entry);
  }
  const categoryMix = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      revenue: Math.round(v.revenue * 100) / 100,
      bookings: v.bookings,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    kpis: {
      totalBookings: inRange.length,
      revenue: Math.round(revenue * 100) / 100,
      expectedRevenue:
        Math.round(
          upcoming.reduce((s, b) => s + b.service.price, 0) * 100,
        ) / 100,
      noShowRate: Math.round(noShowRate * 10) / 10,
      avgRating:
        avgRatingAgg._avg.rating !== null
          ? Math.round(avgRatingAgg._avg.rating * 10) / 10
          : 0,
      activeCustomers: allTimeCustomers.length,
      upcomingBookings: upcoming.length,
      cancelRate: Math.round(cancelRate * 10) / 10,
      prevRevenue: Math.round(prevRevenue * 100) / 100,
      prevTotalBookings: prevRange.length,
      prevNoShowRate: Math.round(prevNoShowRate * 10) / 10,
      revenueDeltaPct: pct(Math.round(revenue * 100) / 100, Math.round(prevRevenue * 100) / 100),
      bookingsDeltaPct: pct(inRange.length, prevRange.length),
      noShowDeltaPct:
        prevNoShowRate > 0
          ? Math.round((noShowRate - prevNoShowRate) * 10) / 10
          : null,
    },
    bookingsPerDay,
    revenueTrend,
    revenueByService,
    peakHours,
    topProviders,
    statusMix,
    categoryMix,
    recentBookings: recent.map(toBookingDTO),
  };
}

function DashboardHours(hourCounts: number[]) {
  const peakHours: { hour: number; label: string; bookings: number }[] = [];
  for (let h = 7; h <= 20; h++) {
    peakHours.push({
      hour: h,
      label: `${h.toString().padStart(2, "0")}:00`,
      bookings: hourCounts[h] ?? 0,
    });
  }
  return peakHours;
}

/** CSV rows for the admin export. */
export function bookingCsvRows(
  bookings: BookingFull[],
): (string | number | null)[][] {
  return bookings.map((b) => [
    b.id,
    b.createdAt.toISOString(),
    b.startAt.toISOString(),
    b.endAt.toISOString(),
    b.service.name,
    b.service.category,
    b.provider.user.name,
    b.customer.name,
    b.status,
    b.service.price,
    b.service.durationMin,
    b.notes ?? "",
    b.review?.rating ?? "",
  ]);
}
