import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingInclude } from "@/lib/serialize";
import { fmtMoney } from "@/lib/format";

/** RFC 5545 date-time (UTC, basic format): 20261007T163000Z */
function icsDate(d: Date): string {
  return `${d.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** Escapes text properties per RFC 5545 §3.3.11. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds long lines at 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [line.slice(0, 74)];
  let rest = line.slice(74);
  while (rest.length > 0) {
    parts.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

const CRLF = "\r\n";

/**
 * GET /api/bookings/:id/calendar.ics — a downloadable calendar invite for a
 * booking (customer's own, provider's own schedule item, or admin). Generates
 * RFC 5545 on the fly: no library, ~60 lines.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const session = await requireSession(req);
    const { id } = await ctx.params;

    const booking = await db.booking.findUnique({
      where: { id },
      include: bookingInclude,
    });
    if (!booking) throw new HttpError(404, "NOT_FOUND", "Booking not found.");

    const isOwner = session.role === "CUSTOMER" && booking.customerId === session.id;
    const isOwnProvider =
      session.role === "PROVIDER" && session.providerId === booking.providerId;
    const isAdmin = session.role === "ADMIN";
    if (!isOwner && !isOwnProvider && !isAdmin) {
      throw new HttpError(403, "FORBIDDEN", "You can only export your own bookings.");
    }
    if (booking.status === "CANCELLED") {
      throw new HttpError(400, "BAD_STATE", "Cancelled bookings cannot be exported.");
    }

    const summary =
      session.role === "PROVIDER"
        ? `${booking.service.name} · ${booking.customer.name}`
        : `${booking.service.name} with ${booking.provider.user.name}`;

    const descriptionParts = [
      `${booking.service.category} · ${booking.service.durationMin} min · ${fmtMoney(booking.service.price)}`,
      session.role === "PROVIDER"
        ? `Customer: ${booking.customer.name}`
        : `Provider: ${booking.provider.user.name} (${booking.provider.specialty || booking.provider.user.name})`,
      `Status: ${booking.status.toLowerCase()}`,
    ];
    if (booking.notes) descriptionParts.push(`Notes: ${booking.notes}`);
    descriptionParts.push("Booked with SlotWise — bookings & analytics for service businesses.");

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SlotWise//Booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:SlotWise bookings",
      "BEGIN:VEVENT",
      `UID:${booking.id}@slotwise.test`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(booking.startAt)}`,
      `DTEND:${icsDate(booking.endAt)}`,
      `SUMMARY:${esc(summary)}`,
      `DESCRIPTION:${esc(descriptionParts.join("\n"))}`,
      "LOCATION:SlotWise (see booking for address)",
      `STATUS:${booking.status === "PENDING" ? "TENTATIVE" : "CONFIRMED"}`,
      `SEQUENCE:${booking.status === "PENDING" ? 0 : 1}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT60M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`Reminder: ${summary}`)}`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ];

    const ics = lines.map(fold).join(CRLF) + CRLF;
    const filename = `slotwise-${booking.service.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${booking.startAt.toISOString().slice(0, 10)}.ics`;

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });
}
