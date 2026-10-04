// Pure formatting helpers — safe on both client and server.
// SlotWise keeps all appointment MATH in UTC ("business timezone = UTC");
// display formatting additionally honours a per-user display timezone.
// The module-level display tz defaults to "UTC" and is ONLY mutated on the
// client (see auth-store hydration + the timezone settings dialog) from a
// customer's profile — staff views therefore always render business-UTC.
// Server code must use the explicit-tz variants (fmtDateTz/fmtTimeTz) when
// it needs recipient-local copy; the no-arg formatters on the server see the
// untouched default.

import { isValidTimezone, tzShortLabel } from "@/lib/tz";

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_MS = 86_400_000;

let displayTz = "UTC";

/** Client-only: set the display timezone from the signed-in user's profile. */
export function setDisplayTimezone(tz: string | null | undefined): void {
  displayTz = tz && isValidTimezone(tz) ? tz : "UTC";
}

/** The active display timezone ("UTC" on the server and for staff). */
export function activeTimezone(): string {
  return displayTz;
}

/** Short label for the active display timezone ("UTC", "UTC+5", …). */
export function tzSuffix(): string {
  return tzShortLabel(displayTz);
}

interface LocalParts {
  year: number;
  monthShort: string;
  day: number;
  hour: number;
  minute: number;
  weekdayIdx: number;
}

function localParts(iso: string | Date, tz: string): LocalParts {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = dtf.formatToParts(iso instanceof Date ? iso : new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayIdx = Math.max(0, WEEKDAY_SHORT.indexOf(get("weekday")));
  return {
    year: Number(get("year")),
    monthShort: get("month"),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekdayIdx,
  };
}

const pad2 = (n: number) => n.toString().padStart(2, "0");

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Local calendar day key ("YYYY-MM-DD") of NOW in the display timezone. */
export function todayKey(): string {
  const p = localParts(new Date(), displayTz);
  const monthIdx = Math.max(0, MONTH_SHORT.indexOf(p.monthShort)) + 1;
  return `${p.year}-${pad2(monthIdx)}-${pad2(p.day)}`;
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** "Mon, 4 Oct 2026" in the display timezone. */
export function fmtDateUTC(iso: string): string {
  const p = localParts(iso, displayTz);
  return `${WEEKDAY_SHORT[p.weekdayIdx]}, ${p.day} ${p.monthShort} ${p.year}`;
}

/** Explicit-tz variant for server-side recipient-local copy. */
export function fmtDateTz(iso: string, tz: string): string {
  const p = localParts(iso, isValidTimezone(tz) ? tz : "UTC");
  return `${WEEKDAY_SHORT[p.weekdayIdx]}, ${p.day} ${p.monthShort} ${p.year}`;
}

/** "4 Oct" in the display timezone. */
export function fmtDateShortUTC(iso: string): string {
  const p = localParts(iso, displayTz);
  return `${p.day} ${p.monthShort}`;
}

/** "14:30" in the display timezone. */
export function fmtTimeUTC(iso: string): string {
  const p = localParts(iso, displayTz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Explicit-tz variant for server-side recipient-local copy. */
export function fmtTimeTz(iso: string, tz: string): string {
  const p = localParts(iso, isValidTimezone(tz) ? tz : "UTC");
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function fmtDateTimeUTC(iso: string): string {
  return `${fmtDateUTC(iso)} · ${fmtTimeUTC(iso)}`;
}

/** Local hour of the day (0–23) in the display timezone — slot grouping. */
export function localHour(iso: string): number {
  return localParts(iso, displayTz).hour;
}

/** Local day-of-week index (0=Sun) in the display timezone. */
export function localWeekdayIdx(iso: string | Date): number {
  return localParts(iso instanceof Date ? iso.toISOString() : iso, displayTz).weekdayIdx;
}

/** Local day-of-month in the display timezone. */
export function localDayOfMonth(iso: string | Date): number {
  return localParts(iso instanceof Date ? iso.toISOString() : iso, displayTz).day;
}

/** Local short month name in the display timezone. */
export function localMonthShort(iso: string | Date): string {
  return localParts(iso instanceof Date ? iso.toISOString() : iso, displayTz).monthShort;
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function fmtMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function minutesToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

export type StatusMeta = {
  label: string;
  className: string;
  dot: string;
};

export const STATUS_META: Record<string, StatusMeta> = {
  PENDING: {
    label: "Pending",
    className:
      "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  CONFIRMED: {
    label: "Confirmed",
    className:
      "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
  COMPLETED: {
    label: "Completed",
    className:
      "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800",
    dot: "bg-teal-500",
  },
  CANCELLED: {
    label: "Cancelled",
    className:
      "bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700",
    dot: "bg-stone-400",
  },
  NO_SHOW: {
    label: "No-show",
    className:
      "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800",
    dot: "bg-rose-500",
  },
};

export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status,
      className: "bg-muted text-muted-foreground border-border",
      dot: "bg-muted-foreground",
    }
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function slotGroupLabel(hour: number): string {
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}
