import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, query, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { emitTimeOffChanged } from "@/lib/realtime";
import { notifyTimeOffConflicts } from "@/lib/notifications";
import type { TimeOffDTO } from "@/lib/types";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AHEAD_DAYS = 180;

const createSchema = z.object({
  /** First blocked day (YYYY-MM-DD). */
  date: z.string().regex(DATE),
  /** Last blocked day — omit for a single day. */
  endDate: z.string().regex(DATE).optional(),
  /** Partial-day window (HH:mm). Omit for a full-day block. */
  startTime: z.string().regex(HH_MM).optional(),
  endTime: z.string().regex(HH_MM).optional(),
  reason: z.string().trim().max(100).optional(),
});

/** True when the client sent a partial-day window. */
function isPartial(body: z.infer<typeof createSchema>): boolean {
  return Boolean(body.startTime || body.endTime);
}

async function toDto(
  t: { id: string; startAt: Date; endAt: Date; reason: string; createdAt: Date },
  providerId: string,
): Promise<TimeOffDTO> {
  const conflicts = await db.booking.count({
    where: {
      providerId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startAt: { lt: t.endAt },
      endAt: { gt: t.startAt },
    },
  });
  return {
    id: t.id,
    startAt: t.startAt.toISOString(),
    endAt: t.endAt.toISOString(),
    reason: t.reason,
    conflicts,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * GET /api/providers/me/time-off — the provider's time-off windows
 * (upcoming + past 14 days), each annotated with the number of active
 * bookings that fall inside it.
 */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const providerId = resolveProviderId(session, query(req));

    const since = new Date(Date.now() - 14 * 86_400_000);
    const rows = await db.timeOff.findMany({
      where: { providerId, endAt: { gte: since } },
      orderBy: { startAt: "asc" },
      take: 100,
    });

    const items = await Promise.all(rows.map((t) => toDto(t, providerId)));
    return ok({ items });
  });
}

/**
 * POST /api/providers/me/time-off — block a day (or a partial day, or a
 * date range). Active bookings inside the window are NOT cancelled — their
 * customers get a "schedule change" notification so the business can rebook
 * them manually, exactly like a real receptionist would.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const providerId = resolveProviderId(session, query(req));
    const body = createSchema.parse(await readJson(req));

    const partial = isPartial(body);
    if (partial && (!body.startTime || !body.endTime)) {
      throw new HttpError(
        400,
        "BAD_WINDOW",
        "Partial-day time off needs both a start and an end time.",
      );
    }

    const dayStart = new Date(`${body.date}T00:00:00.000Z`);
    if (Number.isNaN(dayStart.getTime())) {
      throw new HttpError(400, "BAD_DATE", "Invalid date.");
    }

    let startAt: Date;
    let endAt: Date;
    if (partial) {
      startAt = new Date(`${body.date}T${body.startTime}:00.000Z`);
      endAt = new Date(`${body.date}T${body.endTime}:00.000Z`);
    } else {
      const lastDay = body.endDate ?? body.date;
      startAt = dayStart;
      endAt = new Date(
        new Date(`${lastDay}T00:00:00.000Z`).getTime() + 86_400_000,
      );
    }

    if (endAt <= startAt) {
      throw new HttpError(400, "BAD_WINDOW", "Time off must end after it starts.");
    }
    if (endAt.getTime() - startAt.getTime() > MAX_AHEAD_DAYS * 86_400_000) {
      throw new HttpError(400, "TOO_LONG", "Time off can cover at most 180 days.");
    }
    if (endAt.getTime() < Date.now()) {
      throw new HttpError(400, "IN_PAST", "Time off must not lie entirely in the past.");
    }
    if (startAt.getTime() > Date.now() + MAX_AHEAD_DAYS * 86_400_000) {
      throw new HttpError(400, "TOO_FAR", "Time off can be at most 180 days ahead.");
    }

    const created = await db.timeOff.create({
      data: {
        providerId,
        startAt,
        endAt,
        reason: body.reason ?? "",
      },
    });

    // Warn affected customers (mock email), then refresh open slot grids.
    const conflicts = await db.booking.findMany({
      where: {
        providerId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      select: { id: true, customerId: true, startAt: true, service: { select: { name: true } } },
      take: 50,
    });
    const provider = await db.provider.findUnique({
      where: { id: providerId },
      select: { user: { select: { name: true } } },
    });
    if (conflicts.length > 0 && provider) {
      await notifyTimeOffConflicts(
        provider.user.name,
        conflicts.map((c) => ({ ...c, serviceName: c.service.name })),
        created.reason,
      );
    }
    emitTimeOffChanged(providerId, startAt, endAt);

    return ok({ timeOff: await toDto(created, providerId), notified: conflicts.length }, 201);
  });
}

function resolveProviderId(
  session: { id: string; role: string; providerId: string | null },
  params: URLSearchParams,
): string {
  if (session.role === "ADMIN") {
    const target = params.get("providerId");
    if (target) return target;
  }
  if (!session.providerId) {
    throw new HttpError(
      400,
      "NO_PROVIDER_PROFILE",
      "This account is not linked to a provider profile.",
    );
  }
  return session.providerId;
}
