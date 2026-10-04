import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query, HttpError } from "@/lib/api";
import { generateSlotsForDate, LEAD_MIN, SLOT_STEP_MIN } from "@/lib/slots";
import { format } from "date-fns";

/**
 * GET /api/providers/:id/slots?date=YYYY-MM-DD&serviceId=...
 * Public slot grid for one provider + service on a given date.
 * Booked/past slots come back with available=false so the UI can grey them out.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const params = query(req);

    const date = params.get("date") ?? format(new Date(), "yyyy-MM-dd");
    const serviceId = params.get("serviceId");
    if (!serviceId) {
      throw new HttpError(400, "BAD_REQUEST", "serviceId is required.");
    }

    const link = await db.providerService.findUnique({
      where: { providerId_serviceId: { providerId: id, serviceId } },
      include: { service: true, provider: true },
    });
    if (!link || !link.provider.isActive || !link.service.isActive) {
      throw new HttpError(404, "NOT_FOUND", "This provider does not offer the requested service.");
    }

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid date.");
    }
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    const [availability, busy] = await Promise.all([
      db.availability.findMany({ where: { providerId: id } }),
      db.booking.findMany({
        where: {
          providerId: id,
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { lt: dayEnd },
          endAt: { gt: dayStart },
        },
        select: { startAt: true, endAt: true },
      }),
    ]);

    const slots = generateSlotsForDate(
      availability,
      busy,
      link.service.durationMin,
      date,
    );

    return ok({
      date,
      providerId: id,
      serviceId,
      durationMin: link.service.durationMin,
      stepMin: SLOT_STEP_MIN,
      leadMin: LEAD_MIN,
      slots,
    });
  });
}
