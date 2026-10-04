import { db } from "@/lib/db";
import { HttpError } from "@/lib/api";
import type { SlotDTO } from "@/lib/types";

/** Slot grid granularity and minimum lead time for same-day bookings. */
export const SLOT_STEP_MIN = 15;
export const LEAD_MIN = 60;

export interface AvailabilityLike {
  weekday: number;
  startMin: number;
  endMin: number;
}

export interface BusyLike {
  startAt: Date;
  endAt: Date;
}

/** "YYYY-MM-DD" (business timezone = UTC) -> UTC midnight Date. */
export function dateKeyToUtc(dateKey: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HttpError(400, "BAD_DATE", "Date must be in YYYY-MM-DD format.");
  }
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new HttpError(400, "BAD_DATE", "Invalid date.");
  }
  return d;
}

export function utcToDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** minutes since midnight (UTC) */
export function minutesOfDay(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/**
 * Generates the bookable slot grid for one provider on one date.
 * Slots are 15-min aligned, must fit fully inside a single availability
 * window, and are marked unavailable when they overlap an active booking
 * (PENDING/CONFIRMED), a time-off window, or fall inside the lead-time window.
 */
export function generateSlotsForDate(
  availability: AvailabilityLike[],
  busy: BusyLike[],
  durationMin: number,
  dateKey: string,
  now = new Date(),
  blocked: BusyLike[] = [],
): SlotDTO[] {
  const dayStart = dateKeyToUtc(dateKey);
  const weekday = dayStart.getUTCDay();
  const earliest = now.getTime() + LEAD_MIN * 60_000;

  const windows = availability
    .filter((a) => a.weekday === weekday)
    .sort((a, b) => a.startMin - b.startMin);

  const slots: SlotDTO[] = [];
  for (const w of windows) {
    for (let m = w.startMin; m + durationMin <= w.endMin; m += SLOT_STEP_MIN) {
      const startAt = new Date(dayStart.getTime() + m * 60_000);
      const endAt = new Date(dayStart.getTime() + (m + durationMin) * 60_000);

      const tooSoon = startAt.getTime() < earliest;
      const overlaps = busy.some(
        (b) => b.startAt < endAt && b.endAt > startAt,
      );
      const off = blocked.some(
        (b) => b.startAt < endAt && b.endAt > startAt,
      );

      slots.push({
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        available: !overlaps && !tooSoon && !off,
      });
    }
  }
  return slots;
}

/**
 * Validates that a [start, end) range lies fully inside one availability
 * window of the provider's weekday (UTC).
 */
export function isWithinAvailability(
  availability: AvailabilityLike[],
  startAt: Date,
  endAt: Date,
): boolean {
  const weekday = startAt.getUTCDay();
  const startMin = minutesOfDay(startAt);
  const endMin = minutesOfDay(endAt);
  if (endMin <= startMin) return false; // crosses midnight — not supported
  return availability.some(
    (a) =>
      a.weekday === weekday &&
      a.startMin <= startMin &&
      a.endMin >= endMin,
  );
}

/** Overlap test used by the transactional double-booking guard. */
export function overlapsRange(
  busy: BusyLike[],
  startAt: Date,
  endAt: Date,
): boolean {
  return busy.some((b) => b.startAt < endAt && b.endAt > startAt);
}

/**
 * Finds the earliest bookable slot over the next N days for a provider.
 * Used to power "Next available" badges in search results.
 */
export async function computeNextAvailable(
  providerId: string,
  durationMin: number,
  days = 7,
): Promise<string | null> {
  const now = new Date();
  const horizon = new Date(now.getTime() + days * 86_400_000);

  const [availability, busy, timeOff] = await Promise.all([
    db.availability.findMany({ where: { providerId } }),
    db.booking.findMany({
      where: {
        providerId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { gte: new Date(now.getTime() - 86_400_000), lt: horizon },
      },
      select: { startAt: true, endAt: true },
    }),
    db.timeOff.findMany({
      where: { providerId, startAt: { lt: horizon }, endAt: { gte: now } },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const busyLikes: BusyLike[] = busy.map((b) => ({
    startAt: b.startAt,
    endAt: b.endAt,
  }));

  for (let i = 0; i < days; i++) {
    const day = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + i,
      ),
    );
    const slots = generateSlotsForDate(
      availability,
      busyLikes,
      durationMin,
      day.toISOString().slice(0, 10),
      now,
      timeOff,
    );
    const first = slots.find((s) => s.available);
    if (first) return first.startAt;
  }
  return null;
}
