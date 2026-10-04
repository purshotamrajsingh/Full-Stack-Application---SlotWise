import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, query, readJson, HttpError } from "@/lib/api";
import { getSession, requireSession } from "@/lib/auth";
import { enrichServices, serviceInclude } from "@/lib/services";
import type { ServiceDTO } from "@/lib/types";

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  durationMin: z.coerce.number().int().min(15).max(480),
  price: z.coerce.number().min(0).max(10000),
  isActive: z.boolean().optional(),
  providerIds: z.array(z.string()).optional(),
});

/**
 * GET /api/services — public catalogue with search, filtering and sorting.
 * Query: q, category, minPrice, maxPrice, provider, sort, includeInactive (admin).
 * Sorts: price_asc | price_desc | rating | next_available | duration | popular | name
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const params = query(req);
    const q = (params.get("q") ?? "").trim().toLowerCase();
    const category = params.get("category") ?? "";
    const providerFilter = params.get("provider") ?? "";
    const sort = params.get("sort") ?? "popular";
    const minPrice = params.get("minPrice");
    const maxPrice = params.get("maxPrice");

    const session = await getSession(req);
    const includeInactive =
      params.get("includeInactive") === "1" && session?.role === "ADMIN";

    const services = await db.service.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: serviceInclude,
      orderBy: { name: "asc" },
    });

    let enriched = await enrichServices(
      services,
      session?.role === "CUSTOMER" ? session.id : null,
    );

    // Text search across service name/category/description and provider names.
    if (q) {
      enriched = enriched.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.providers.some((p) => p.name.toLowerCase().includes(q)),
      );
    }
    if (category && category !== "all") {
      enriched = enriched.filter((s) => s.category === category);
    }
    if (providerFilter) {
      enriched = enriched.filter((s) =>
        s.providers.some((p) => p.id === providerFilter),
      );
    }
    if (minPrice !== null && minPrice !== "") {
      const min = Number(minPrice);
      if (!Number.isNaN(min)) enriched = enriched.filter((s) => s.price >= min);
    }
    if (maxPrice !== null && maxPrice !== "" && maxPrice !== "0") {
      const max = Number(maxPrice);
      if (!Number.isNaN(max)) enriched = enriched.filter((s) => s.price <= max);
    }

    const sorters: Record<string, (a: ServiceDTO, b: ServiceDTO) => number> = {
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
      next_available: (a, b) => {
        if (!a.nextAvailableAt && !b.nextAvailableAt) return 0;
        if (!a.nextAvailableAt) return 1;
        if (!b.nextAvailableAt) return -1;
        return a.nextAvailableAt.localeCompare(b.nextAvailableAt);
      },
      duration: (a, b) => a.durationMin - b.durationMin,
      popular: (a, b) => b.bookingCount - a.bookingCount,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    enriched.sort(sorters[sort] ?? sorters.popular);

    return ok({ items: enriched, total: enriched.length });
  });
}

/** POST /api/services — admin only: creates a service and links providers. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const body = createSchema.parse(await readJson(req));

    if (body.providerIds && body.providerIds.length > 0) {
      const providers = await db.provider.count({
        where: { id: { in: body.providerIds } },
      });
      if (providers !== body.providerIds.length) {
        throw new HttpError(400, "BAD_PROVIDERS", "One or more provider IDs are invalid.");
      }
    }

    const created = await db.service.create({
      data: {
        name: body.name,
        category: body.category,
        description: body.description ?? "",
        durationMin: body.durationMin,
        price: body.price,
        isActive: body.isActive ?? true,
        providers:
          body.providerIds && body.providerIds.length > 0
            ? {
                create: body.providerIds.map((providerId) => ({
                  providerId,
                })),
              }
            : undefined,
      },
      include: serviceInclude,
    });

    const [dto] = await enrichServices([created]);
    return ok({ service: dto }, 201);
  });
}
