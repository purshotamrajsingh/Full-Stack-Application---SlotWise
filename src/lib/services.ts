import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateSlotsForDate } from "@/lib/slots";
import type { ProviderSummary, ServiceDTO } from "@/lib/types";

const DAY_MS = 86_400_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export { EMAIL_RE };

export const serviceInclude = {
  providers: {
    include: {
      provider: {
        include: { user: { select: { name: true } } },
      },
    },
  },
} satisfies Prisma.ServiceInclude;

export type ServiceWithProviders = Prisma.ServiceGetPayload<{
  include: typeof serviceInclude;
}>;

interface ProviderLike {
  id: string;
  bio: string;
  specialty: string;
  isActive: boolean;
  user: { name: string };
}

interface ReviewRow {
  rating: number;
  booking: { serviceId: string; providerId: string };
}

/**
 * Enriches services with provider summaries, ratings, booking counts and the
 * earliest bookable slot over the next 7 days ("next available").
 */
export async function enrichServices(
  services: ServiceWithProviders[],
): Promise<ServiceDTO[]> {
  const now = new Date();

  const [reviews, bookingCounts] = await Promise.all([
    db.review.findMany({
      select: {
        rating: true,
        booking: { select: { serviceId: true, providerId: true } },
      },
    }) as Promise<ReviewRow[]>,
    db.booking.groupBy({ by: ["serviceId"], _count: true }),
  ]);

  const svcRatings = new Map<string, { sum: number; n: number }>();
  const provRatings = new Map<string, { sum: number; n: number }>();
  for (const r of reviews) {
    const s = svcRatings.get(r.booking.serviceId) ?? { sum: 0, n: 0 };
    s.sum += r.rating;
    s.n += 1;
    svcRatings.set(r.booking.serviceId, s);

    const p = provRatings.get(r.booking.providerId) ?? { sum: 0, n: 0 };
    p.sum += r.rating;
    p.n += 1;
    provRatings.set(r.booking.providerId, p);
  }

  const countMap = new Map(
    bookingCounts.map((c) => [c.serviceId, c._count]),
  );

  // Next-available computation grouped per provider (one availability/busy fetch each).
  const pairs: {
    providerId: string;
    serviceId: string;
    durationMin: number;
  }[] = [];
  for (const s of services) {
    for (const ps of s.providers) {
      if (ps.provider.isActive) {
        pairs.push({
          providerId: ps.provider.id,
          serviceId: s.id,
          durationMin: s.durationMin,
        });
      }
    }
  }
  const nextMap = await computeNextAvailableMap(pairs, now);

  return services.map((s) => {
    const providers: ProviderSummary[] = s.providers
      .map((ps) => ps.provider)
      .filter((p) => p.isActive)
      .map((p) => {
        const r = provRatings.get(p.id);
        return {
          id: p.id,
          name: p.user.name,
          specialty: p.specialty,
          bio: p.bio,
          rating: r && r.n > 0 ? Math.round((r.sum / r.n) * 10) / 10 : 0,
          reviewCount: r?.n ?? 0,
        };
      });

    let nextAvailableAt: string | null = null;
    for (const p of providers) {
      const candidate = nextMap.get(`${p.id}:${s.id}`);
      if (
        candidate &&
        (nextAvailableAt === null || candidate < nextAvailableAt)
      ) {
        nextAvailableAt = candidate;
      }
    }

    const r = svcRatings.get(s.id);
    return {
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
      durationMin: s.durationMin,
      price: s.price,
      isActive: s.isActive,
      providers,
      rating: r && r.n > 0 ? Math.round((r.sum / r.n) * 10) / 10 : 0,
      reviewCount: r?.n ?? 0,
      bookingCount: countMap.get(s.id) ?? 0,
      nextAvailableAt,
    };
  });
}

async function computeNextAvailableMap(
  pairs: { providerId: string; serviceId: string; durationMin: number }[],
  now: Date,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (pairs.length === 0) return result;

  const providerIds = [...new Set(pairs.map((p) => p.providerId))];
  const providerData = await Promise.all(
    providerIds.map(async (pid) => {
      const [availability, busy] = await Promise.all([
        db.availability.findMany({ where: { providerId: pid } }),
        db.booking.findMany({
          where: {
            providerId: pid,
            status: { in: ["PENDING", "CONFIRMED"] },
            startAt: {
              gte: new Date(now.getTime() - DAY_MS),
              lt: new Date(now.getTime() + 8 * DAY_MS),
            },
          },
          select: { startAt: true, endAt: true },
        }),
      ]);
      return [pid, { availability, busy }] as const;
    }),
  );
  const dataByProvider = new Map(providerData);

  const day0 = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  for (const pair of pairs) {
    const data = dataByProvider.get(pair.providerId);
    if (!data) continue;
    for (let d = 0; d < 7; d++) {
      const key = new Date(day0.getTime() + d * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const slots = generateSlotsForDate(
        data.availability,
        data.busy,
        pair.durationMin,
        key,
        now,
      );
      const first = slots.find((s) => s.available);
      if (first) {
        result.set(`${pair.providerId}:${pair.serviceId}`, first.startAt);
        break;
      }
    }
  }
  return result;
}

/**
 * Structural input for enrichProvider — accepts any Prisma payload whose
 * include covers the fields below (full `user: true` or a narrower
 * `{ select: { name, email } }` both satisfy it).
 */
export interface ProviderEnrichInput {
  id: string;
  userId: string;
  bio: string;
  specialty: string;
  isActive: boolean;
  user: { name: string; email: string };
  services: {
    service: {
      id: string;
      name: string;
      category: string;
      price: number;
      durationMin: number;
    };
  }[];
}

/** Serialises a provider (with user + services) for public listing/staff views. */
export async function enrichProvider(
  provider: ProviderEnrichInput,
): Promise<{
  id: string;
  userId: string;
  name: string;
  email: string;
  bio: string;
  specialty: string;
  isActive: boolean;
  rating: number;
  reviewCount: number;
  services: {
    id: string;
    name: string;
    category: string;
    price: number;
    durationMin: number;
  }[];
}> {
  const reviews = (await db.review.findMany({
    select: {
      rating: true,
      booking: { select: { providerId: true } },
    },
  })) as ReviewRow[];

  const own = reviews.filter((r) => r.booking.providerId === provider.id);
  const rating =
    own.length > 0
      ? Math.round((own.reduce((s, r) => s + r.rating, 0) / own.length) * 10) / 10
      : 0;

  return {
    id: provider.id,
    userId: provider.userId,
    name: provider.user.name,
    email: provider.user.email,
    bio: provider.bio,
    specialty: provider.specialty,
    isActive: provider.isActive,
    rating,
    reviewCount: own.length,
    services: provider.services.map((ps) => ({
      id: ps.service.id,
      name: ps.service.name,
      category: ps.service.category,
      price: ps.service.price,
      durationMin: ps.service.durationMin,
    })),
  };
}

export type { ProviderLike };
