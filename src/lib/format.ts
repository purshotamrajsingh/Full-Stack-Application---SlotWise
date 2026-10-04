// Pure formatting helpers — safe on both client and server.
// SlotWise keeps all appointment math in UTC ("business timezone = UTC"),
// so every formatter below intentionally renders UTC wall-clock values.

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

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00.000Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function fmtDateUTC(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAY_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${d.toLocaleString(
    "en-GB",
    { month: "short", timeZone: "UTC" },
  )} ${d.getUTCFullYear()}`;
}

export function fmtDateShortUTC(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", {
    month: "short",
    timeZone: "UTC",
  })}`;
}

export function fmtTimeUTC(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h.toString().padStart(2, "0")}:${m}`;
}

export function fmtDateTimeUTC(iso: string): string {
  return `${fmtDateUTC(iso)} · ${fmtTimeUTC(iso)}`;
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
