// Slot-freed waitlist engine.
//
// Customers can "watch" a taken slot (see lib/waitlist routes). Whenever a
// slot becomes free again — a booking is cancelled, or rescheduled away —
// this engine finds every active watch entry that covers an overlapping
// window, skips users who now hold a conflicting booking of their own, and
// fires a one-shot "slot opened" notification (mock email + realtime toast).

import { db } from "@/lib/db";
import { notifyWaitlistOpened } from "@/lib/notifications";

/**
 * Called after any mutation that frees a provider's time window.
 * Best-effort: never throws (call sites use .catch anyway, but the loop
 * itself guards per-entry).
 *
 * @returns number of watchers notified (useful for logs/QA).
 */
export async function notifyFreedSlot(
  providerId: string,
  freedStart: Date,
  freedEnd: Date,
): Promise<number> {
  const now = new Date();

  // Active, un-notified watch entries overlapping the freed window whose
  // watched slot still lies in the future.
  const entries = await db.waitlist.findMany({
    where: {
      providerId,
      notifiedAt: null,
      AND: [{ startAt: { lt: freedEnd } }, { startAt: { gte: now } }],
      endAt: { gt: freedStart },
    },
    include: {
      service: { select: { name: true } },
      provider: { include: { user: { select: { name: true } } } },
    },
    take: 25,
  });

  let notified = 0;
  for (const entry of entries) {
    try {
      // Skip watchers who now hold an overlapping active booking with this
      // provider (e.g. they booked something else meanwhile) — they're busy.
      const busy = await db.booking.findFirst({
        where: {
          customerId: entry.userId,
          providerId,
          status: { in: ["PENDING", "CONFIRMED"] },
          startAt: { lt: entry.endAt },
          endAt: { gt: entry.startAt },
        },
        select: { id: true },
      });
      if (busy) continue;

      await notifyWaitlistOpened({
        userId: entry.userId,
        serviceName: entry.service.name,
        providerName: entry.provider.user.name,
        serviceId: entry.serviceId,
        providerId: entry.providerId,
        startAt: entry.startAt,
        endAt: entry.endAt,
      });
      await db.waitlist.update({
        where: { id: entry.id },
        data: { notifiedAt: new Date() },
      });
      notified += 1;
    } catch (err) {
      console.error("[waitlist] failed to notify entry", entry.id, err);
    }
  }
  return notified;
}
