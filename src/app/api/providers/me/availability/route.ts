import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handle, ok, query, readJson, HttpError } from "@/lib/api";
import { requireSession } from "@/lib/auth";

const windowSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  startMin: z.coerce.number().int().min(0).max(1439),
  endMin: z.coerce.number().int().min(1).max(1440),
});

const putSchema = z.object({
  windows: z.array(windowSchema).max(40),
});

/** GET /api/providers/me/availability — provider's own weekly schedule. */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const providerId = resolveProviderId(session, query(req));
    const availability = await db.availability.findMany({
      where: { providerId },
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
    });
    return ok({
      items: availability.map((a) => ({
        id: a.id,
        weekday: a.weekday,
        startMin: a.startMin,
        endMin: a.endMin,
      })),
    });
  });
}

/**
 * PUT /api/providers/me/availability — replaces the weekly schedule.
 * Validates that windows are well-formed and do not overlap within a weekday.
 */
export async function PUT(req: NextRequest) {
  return handle(async () => {
    const session = await requireSession(req, ["PROVIDER", "ADMIN"]);
    const providerId = resolveProviderId(session, query(req));
    const body = putSchema.parse(await readJson(req));

    for (const w of body.windows) {
      if (w.endMin <= w.startMin) {
        throw new HttpError(
          400,
          "BAD_WINDOW",
          "Each window must end after it starts.",
        );
      }
    }

    // Overlap validation per weekday
    const byWeekday = new Map<number, typeof body.windows>();
    for (const w of body.windows) {
      const list = byWeekday.get(w.weekday) ?? [];
      list.push(w);
      byWeekday.set(w.weekday, list);
    }
    for (const [weekday, windows] of byWeekday) {
      windows.sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < windows.length; i++) {
        if (windows[i].startMin < windows[i - 1].endMin) {
          throw new HttpError(
            400,
            "AVAILABILITY_OVERLAP",
            `Overlapping windows on day ${weekday} are not allowed.`,
          );
        }
      }
    }

    await db.$transaction([
      db.availability.deleteMany({ where: { providerId } }),
      ...(body.windows.length > 0
        ? [
            db.availability.createMany({
              data: body.windows.map((w) => ({
                providerId,
                weekday: w.weekday,
                startMin: w.startMin,
                endMin: w.endMin,
              })),
            }),
          ]
        : []),
    ]);

    const availability = await db.availability.findMany({
      where: { providerId },
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
    });
    return ok({
      items: availability.map((a) => ({
        id: a.id,
        weekday: a.weekday,
        startMin: a.startMin,
        endMin: a.endMin,
      })),
    });
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
