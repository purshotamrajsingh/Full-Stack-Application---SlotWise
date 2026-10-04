// Timezone utilities — shared by API routes (day-window math) and the client
// (settings dialog). Business timezone stays UTC for availability/booking
// semantics; these helpers only translate between UTC instants and a
// customer's *display* timezone.

/** True when `tz` is a valid IANA timezone name. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` at the given UTC instant. */
function offsetAt(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight starting calendar day `key` (YYYY-MM-DD) in `tz`. */
export function localDayStart(key: string, tz: string): Date {
  const approx = new Date(`${key}T00:00:00.000Z`).getTime();
  // Refine twice — the first pass is usually exact; the second guards the
  // rare case where the offset differs across the DST boundary.
  let start = approx - offsetAt(new Date(approx), tz);
  start = approx - offsetAt(new Date(start), tz);
  return new Date(start);
}

/** UTC instant one local calendar day after `key` in `tz` (24h ± DST shift). */
export function nextLocalDayStart(key: string, tz: string): Date {
  const next = new Date(`${key}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const approx = next.getTime();
  let start = approx - offsetAt(new Date(approx), tz);
  start = approx - offsetAt(new Date(start), tz);
  return new Date(start);
}

/** UTC instants covering the local calendar day `key` in `tz`. */
export function localDayWindow(key: string, tz: string): [Date, Date] {
  return [localDayStart(key, tz), nextLocalDayStart(key, tz)];
}

/**
 * Every UTC date-key (YYYY-MM-DD) whose UTC day overlaps [start, end) —
 * a local day in a shifted timezone spans (parts of) two UTC days.
 */
export function overlappingUtcDayKeys(start: Date, end: Date): string[] {
  const keys: string[] = [];
  let k = start.toISOString().slice(0, 10);
  const last = new Date(end.getTime() - 1).toISOString().slice(0, 10);
  while (k <= last) {
    keys.push(k);
    const d = new Date(`${k}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    k = d.toISOString().slice(0, 10);
  }
  return keys;
}

/** "UTC", "UTC+5" or "UTC+5:30" — short suffix for time labels. */
export function tzShortLabel(tz: string, at: Date = new Date()): string {
  if (tz === "UTC") return "UTC";
  const offMin = Math.round(offsetAt(at, tz) / 60_000);
  if (offMin === 0) return "UTC";
  const sign = offMin > 0 ? "+" : "−";
  const abs = Math.abs(offMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${m}`;
}
