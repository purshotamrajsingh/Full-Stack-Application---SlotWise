import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok, query, HttpError } from "@/lib/api";
import { generateSlotsForDate, LEAD_MIN, SLOT_STEP_MIN } from "@/lib/slots";
import { isValidTimezone, localDayWindow, overlappingUtcDayKeys } from "@/lib/tz";
import { format } from "date-fns";

/**
 * GET /api/providers/:id/slots?date=YYYY-MM-DD&serviceId=...&tz=IANA
 * Public slot grid for one provider + service on a given date.
 *
 * `date` is interpreted in `tz` (default UTC): a local calendar day in a
 * shifted display timezone spans (parts of) two UTC days — slots are
 * generated for both and filtered to the local-day window. Availability
 * windows keep their UTC-weekday semantics (business timezone = UTC).
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
    const tzRaw = params.get("tz") ?? "UTC";
    const tz = isValidTimezone(tzRaw) ? tzRaw : "UTC";

    const link = await db.providerService.findUnique({
      where: { providerId_serviceId: { providerId: id, serviceId } },
      include: { service: true, provider: true },
    });
    if (!link || !link.provider.isActive || !link.service.isActive) {
      throw new HttpError(404, "NOT_FOUND", "This provider does not offer the requested service.");
    }

    // The UTC instant window covering the requested local day.
    const [dayStart, dayEnd] = localDayWindow(date, tz);
    const utcDayKeys = overlappingUtcDayKeys(dayStart, dayEnd);

    const [availability, busy, timeOff] = await Promise.all([
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
      // Time-off windows overlapping the day — public info (a customer
      // browsing the calendar may see that the provider is away).
      db.timeOff.findMany({
        where: { providerId: id, startAt: { lt: dayEnd }, endAt: { gt: dayStart } },
        orderBy: { startAt: "asc" },
      }),
    ]);

    const now = new Date();
    const slots = utcDayKeys
      .flatMap((key) =>
        generateSlotsForDate(
          availability,
          busy,
          link.service.durationMin,
          key,
          now,
          timeOff,
        ),
      )
      // Keep only slots that fall inside the requested local day.
      .filter((s) => {
        const start = new Date(s.startAt).getTime();
        const end = new Date(s.endAt).getTime();
        return start >= dayStart.getTime() && end <= dayEnd.getTime();
      })
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    return ok({
      date,
      tz,
      windowStart: dayStart.toISOString(),
      windowEnd: dayEnd.toISOString(),
      providerId: id,
      serviceId,
      durationMin: link.service.durationMin,
      stepMin: SLOT_STEP_MIN,
      leadMin: LEAD_MIN,
      slots,
      timeOff: timeOff.map((t) => ({
        startAt: t.startAt.toISOString(),
        endAt: t.endAt.toISOString(),
        reason: t.reason,
      })),
    });
  });
}
