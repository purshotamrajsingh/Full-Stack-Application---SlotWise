import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, readJson } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { createNotification } from "@/lib/notifications";

const bodySchema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(5).max(500),
  audience: z.enum(["ALL", "CUSTOMERS", "UPCOMING"]),
});

const MAX_RECIPIENTS = 500;

/**
 * POST /api/admin/broadcast — send a message to every bell in the business
 * (mock email outbox + realtime push). Audiences:
 *   ALL       → every account (owners + staff + customers)
 *   CUSTOMERS → customer accounts only
 *   UPCOMING  → customers with at least one pending/confirmed future booking
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const input = bodySchema.parse(await readJson(req));

    let userIds: string[];
    if (input.audience === "ALL") {
      const rows = await db.user.findMany({
        select: { id: true },
        take: MAX_RECIPIENTS,
      });
      userIds = rows.map((r) => r.id);
    } else if (input.audience === "CUSTOMERS") {
      const rows = await db.user.findMany({
        where: { role: "CUSTOMER" },
        select: { id: true },
        take: MAX_RECIPIENTS,
      });
      userIds = rows.map((r) => r.id);
    } else {
      // UPCOMING: distinct customers holding future active bookings.
      const customerId = await db.booking.findMany({
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { gt: new Date() },
        },
        select: { customerId: true },
        distinct: ["customerId"],
      });
      const ids = customerId.map((b) => b.customerId).slice(0, MAX_RECIPIENTS);
      const rows = await db.user.findMany({
        where: { id: { in: ids }, role: "CUSTOMER" },
        select: { id: true },
      });
      userIds = rows.map((r) => r.id);
    }

    // One outbox row + realtime push per recipient (best-effort; the outbox
    // is the source of truth the bell falls back to on next open anyway).
    let sent = 0;
    for (const userId of userIds) {
      try {
        await createNotification({
          userId,
          type: "broadcast",
          title: input.title,
          body: input.body,
        });
        sent += 1;
      } catch (err) {
        console.error("[broadcast] failed for user", userId, err);
      }
    }

    return ok({ sent, audience: input.audience }, 201);
  });
}
