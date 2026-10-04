import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handle, ok } from "@/lib/api";
import { requireSession } from "@/lib/auth";

/**
 * GET /api/admin/time-off — every provider's upcoming time-off windows,
 * annotated with the number of active bookings caught inside each window.
 * Powers the admin Staff tab's closure overview.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);

    const rows = await db.timeOff.findMany({
      where: { endAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 200,
      include: {
        provider: {
          include: { user: { select: { name: true } } },
        },
      },
    });

    // Conflict counts batched per provider (overlapping active bookings).
    const items = await Promise.all(
      rows.map(async (t) => {
        const conflicts = await db.booking.count({
          where: {
            providerId: t.providerId,
            status: { in: ["PENDING", "CONFIRMED"] },
            startAt: { lt: t.endAt },
            endAt: { gt: t.startAt },
          },
        });
        return {
          id: t.id,
          providerId: t.providerId,
          providerName: t.provider.user.name,
          specialty: t.provider.specialty,
          startAt: t.startAt.toISOString(),
          endAt: t.endAt.toISOString(),
          reason: t.reason,
          conflicts,
        };
      }),
    );

    return ok({ items });
  });
}
