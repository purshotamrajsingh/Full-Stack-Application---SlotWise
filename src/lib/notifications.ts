// Mock email/SMS outbox — persists one Notification row per recipient per
// booking-lifecycle event (what a production build would hand to SMTP/SMS),
// and pushes it live to the recipient's bell over the realtime hub.

import { db } from "@/lib/db";
import { emitNotification, type NotificationMessage } from "@/lib/realtime";
import { fmtDateUTC, fmtTimeUTC, fmtMoney } from "@/lib/format";
import type { BookingDTO } from "@/lib/types";

export type NotificationType =
  | "booking_created" // → customer + provider
  | "booking_status" // → customer (confirmed / completed / no-show)
  | "booking_cancelled" // → provider
  | "booking_rescheduled" // → provider
  | "time_off_conflict"; // → customer (time off added over their booking)

interface CreateInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  bookingId?: string | null;
}

export async function createNotification(input: CreateInput) {
  const row = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      bookingId: input.bookingId ?? null,
    },
  });

  const msg: NotificationMessage = {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    bookingId: row.bookingId,
    createdAt: row.createdAt.toISOString(),
  };
  emitNotification([row.userId], msg);
  return row;
}

function when(b: BookingDTO): string {
  return `${fmtDateUTC(b.startAt)} at ${fmtTimeUTC(b.startAt)}`;
}

/** Customer + provider receipts after a new booking. */
export async function notifyBookingCreated(
  booking: BookingDTO,
  providerUserId: string,
): Promise<void> {
  await Promise.all([
    createNotification({
      userId: booking.customerId,
      type: "booking_created",
      title: `Booking received — ${booking.serviceName}`,
      body: `You're booked with ${booking.providerName} on ${when(booking)} (${fmtMoney(booking.price)}). We'll confirm shortly.`,
      bookingId: booking.id,
    }),
    createNotification({
      userId: providerUserId,
      type: "booking_created",
      title: `New booking — ${booking.serviceName}`,
      body: `${booking.customerName} booked ${booking.serviceName} on ${when(booking)}.`,
      bookingId: booking.id,
    }),
  ]);
}

/** Customer receipt after the provider confirms / completes / marks no-show. */
export async function notifyBookingStatus(
  booking: BookingDTO,
  status: string,
): Promise<void> {
  const map: Record<string, string> = {
    CONFIRMED: `confirmed — see you on ${when(booking)}`,
    COMPLETED: "completed. Thanks for visiting!",
    NO_SHOW: "marked as missed. Contact the business to rebook.",
    CANCELLED: "cancelled by the business. Please rebook if you still need it.",
  };
  const detail = map[status];
  if (!detail) return;
  await createNotification({
    userId: booking.customerId,
    type: "booking_status",
    title: `${booking.serviceName} ${detail.split(".")[0]}.`,
    body: `Your ${booking.serviceName} appointment with ${booking.providerName} was ${detail}`,
    bookingId: booking.id,
  });
}

/** Provider alert when a customer cancels. */
export async function notifyBookingCancelled(
  booking: BookingDTO,
  providerUserId: string,
): Promise<void> {
  await createNotification({
    userId: providerUserId,
    type: "booking_cancelled",
    title: `Cancelled — ${booking.serviceName}`,
    body: `${booking.customerName} cancelled their ${booking.serviceName} on ${when(booking)}. The slot is free again.`,
    bookingId: booking.id,
  });
}

/** Provider alert when a customer reschedules. */
export async function notifyBookingRescheduled(
  booking: BookingDTO,
  providerUserId: string,
): Promise<void> {
  await createNotification({
    userId: providerUserId,
    type: "booking_rescheduled",
    title: `Moved — ${booking.serviceName}`,
    body: `${booking.customerName} moved their ${booking.serviceName} to ${when(booking)}.`,
    bookingId: booking.id,
  });
}

/** Customers whose active bookings fall inside a new time-off window. */
export async function notifyTimeOffConflicts(
  providerName: string,
  bookings: { id: string; customerId: string; serviceName: string; startAt: Date }[],
  reason: string,
): Promise<void> {
  await Promise.all(
    bookings.map((b) =>
      createNotification({
        userId: b.customerId,
        type: "time_off_conflict",
        title: `Schedule change — ${b.serviceName}`,
        body: `${providerName} is now away on ${fmtDateUTC(b.startAt.toISOString())} (${reason || "time off"}). Your booking at ${fmtTimeUTC(b.startAt.toISOString())} may need to move — the business will be in touch.`,
        bookingId: b.id,
      }),
    ),
  );
}
