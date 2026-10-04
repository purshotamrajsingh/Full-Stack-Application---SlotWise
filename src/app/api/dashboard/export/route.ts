import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handle, query, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { bookingCsvRows, bookingInclude } from "@/lib/analytics";
import { toCsv } from "@/lib/csv";

const CSV_HEADERS = [
  "id",
  "created_at",
  "start_at",
  "end_at",
  "service",
  "category",
  "provider",
  "customer",
  "status",
  "price",
  "duration_min",
  "notes",
  "rating",
];

/** GET /api/dashboard/export.csv?range=30 — admin CSV export of bookings. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireSession(req, ["ADMIN"]);
    const rangeParam = Number(query(req).get("range") ?? 30);
    const range = Math.min(Math.max(Number.isNaN(rangeParam) ? 30 : rangeParam, 7), 120);

    const today = new Date();
    const startOfToday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const from = new Date(startOfToday.getTime() - (range - 1) * 86_400_000);

    const bookings = await db.booking.findMany({
      where: { startAt: { gte: from, lt: new Date(startOfToday.getTime() + 86_400_000) } },
      include: bookingInclude,
      orderBy: { startAt: "asc" },
    });

    if (bookings.length === 0) {
      throw new HttpError(404, "NO_DATA", "No bookings in the selected range.");
    }

    const csv = toCsv(CSV_HEADERS, bookingCsvRows(bookings));
    const filename = `slotwise-bookings-${today.toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
