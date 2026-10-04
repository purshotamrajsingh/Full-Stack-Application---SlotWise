"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Plus,
  Save,
  Star,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/slotwise/status-badge";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useAuthStore } from "@/store/auth-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { AvailabilityDTO, BookingDTO } from "@/lib/types";
import {
  fmtDateUTC,
  fmtDuration,
  fmtMoney,
  fmtTimeUTC,
  minutesToTime,
  todayKey,
  WEEKDAY_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => i * 15);
const STATUS_OPTIONS = ["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

/** Skips common title prefixes so "Dr. Priya Nair" greets as "Priya". */
function firstName(name: string): string {
  const clean = name.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, "").trim();
  return clean.split(/\s+/)[0] || name;
}

export function ProviderView() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState("today");

  const bookingsPath = useMemo(() => "/api/bookings?sort=date_asc", []);
  const { data, loading, error, reload } = useApiQuery<{ items: BookingDTO[] }>(bookingsPath);
  const { data: availData, reload: reloadAvail } = useApiQuery<{ items: AvailabilityDTO[] }>(
    "/api/providers/me/availability",
  );

  const bookings = data?.items ?? [];
  const today = todayKey();

  const todays = bookings.filter(
    (b) => b.startAt.slice(0, 10) === today && b.status !== "CANCELLED",
  );
  const upcoming = bookings.filter(
    (b) => b.startAt > new Date().toISOString() && (b.status === "PENDING" || b.status === "CONFIRMED"),
  );
  const rating =
    bookings.filter((b) => b.review).length > 0
      ? bookings.reduce((s, b) => s + (b.review?.rating ?? 0), 0) /
        bookings.filter((b) => b.review).length
      : 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Hi {firstName(user?.name ?? "")} 👋
        </h1>
        <p className="mt-1 text-muted-foreground">
          {fmtDateUTC(new Date().toISOString())} — your diary at a glance.
        </p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarClock} label="Today" value={String(todays.length)} sub="appointments" />
        <StatCard icon={CalendarDays} label="Upcoming" value={String(upcoming.length)} sub="pending & confirmed" />
        <StatCard
          icon={Star}
          label="Rating"
          value={rating > 0 ? rating.toFixed(1) : "—"}
          sub="from reviews"
        />
        <StatCard
          icon={Clock}
          label="Pipeline"
          value={fmtMoney(upcoming.reduce((s, b) => s + b.price, 0))}
          sub="expected revenue"
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="today">Today ({todays.length})</TabsTrigger>
          <TabsTrigger value="all">All bookings</TabsTrigger>
          <TabsTrigger value="availability">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          {error ? (
            <EmptyState icon={CalendarDays} title="Could not load schedule" description={error} />
          ) : loading ? (
            <SkeletonList n={3} />
          ) : todays.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nothing booked today"
              description="Enjoy the quiet — or share your booking link to fill the gaps."
            />
          ) : (
            <BookingList bookings={todays} onChanged={reload} showCustomer />
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <AllBookings bookings={bookings} loading={loading} error={error} onChanged={reload} />
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <AvailabilityEditor
            initial={availData?.items ?? []}
            loaded={!loading && availData !== null}
            onSaved={reloadAvail}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold leading-tight tabular-nums">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SkeletonList({ n }: { n: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
  );
}

function BookingList({
  bookings,
  onChanged,
  showCustomer,
}: {
  bookings: BookingDTO[];
  onChanged: () => void;
  showCustomer?: boolean;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setStatus(booking: BookingDTO, status: string) {
    setBusyId(booking.id);
    try {
      await apiFetch(`/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        body: { status },
      });
      toast.success(`${booking.serviceName} marked ${status.toLowerCase().replace("_", "-")}.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {bookings.map((b) => {
        const busy = busyId === b.id;
        return (
          <Card key={b.id} className={cn("py-0 transition-opacity", busy && "opacity-50")}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <span className="w-20 shrink-0 text-center">
                  <span className="block text-lg font-bold leading-none tabular-nums">
                    {fmtTimeUTC(b.startAt)}
                  </span>
                  <span className="block text-xs text-muted-foreground">{fmtDuration(b.durationMin)}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold leading-tight">{b.serviceName}</p>
                    <StatusBadge status={b.status} />
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                    {showCustomer && (
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="size-3" />
                        {b.customerName}
                      </span>
                    )}
                    <span>{fmtDateUTC(b.startAt)}</span>
                    {b.notes && (
                      <span className="line-clamp-1 text-xs italic">“{b.notes}”</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                <span className="mr-2 hidden text-sm font-semibold tabular-nums sm:block">
                  {fmtMoney(b.price)}
                </span>
                {busy ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    {b.status === "PENDING" && (
                      <Button size="sm" onClick={() => setStatus(b, "CONFIRMED")}>
                        <CheckCircle2 className="size-3.5" /> Confirm
                      </Button>
                    )}
                    {b.status === "CONFIRMED" && (
                      <>
                        <Button size="sm" onClick={() => setStatus(b, "COMPLETED")}>
                          <CheckCircle2 className="size-3.5" /> Complete
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(b, "NO_SHOW")}>
                          <XCircle className="size-3.5" /> No-show
                        </Button>
                      </>
                    )}
                    {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(b, "CANCELLED")}>
                        Cancel
                      </Button>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AllBookings({
  bookings,
  loading,
  error,
  onChanged,
}: {
  bookings: BookingDTO[];
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState("ALL");

  const filtered = useMemo(
    () => (status === "ALL" ? bookings : bookings.filter((b) => b.status === status)),
    [bookings, status],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{filtered.length} bookings</p>
        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44" aria-label="Filter by status">
              {status === "ALL" ? "All statuses" : status.replace("_", " ")}
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "ALL" ? "All statuses" : s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <EmptyState icon={CalendarDays} title="Could not load bookings" description={error} />
      ) : loading ? (
        <SkeletonList n={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No bookings in this view" />
      ) : (
        <BookingList bookings={filtered} onChanged={onChanged} showCustomer />
      )}
    </div>
  );
}

interface WindowDraft {
  weekday: number;
  startMin: number;
  endMin: number;
}

function AvailabilityEditor({
  initial,
  loaded,
  onSaved,
}: {
  initial: AvailabilityDTO[];
  loaded: boolean;
  onSaved: () => void;
}) {
  const [windows, setWindows] = useState<WindowDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  if (windows === null && loaded) {
    setWindows(initial.map((w) => ({ weekday: w.weekday, startMin: w.startMin, endMin: w.endMin })));
  }

  function update(windows: WindowDraft[]) {
    setWindows(windows);
    setDirty(true);
  }

  function setWindow(i: number, patch: Partial<WindowDraft>) {
    if (!windows) return;
    const next = [...windows];
    next[i] = { ...next[i]!, ...patch };
    update(next);
  }

  async function save() {
    if (!windows) return;
    // Client-side sanity: end after start, no overlaps within a weekday.
    for (const w of windows) {
      if (w.endMin <= w.startMin) {
        toast.error(`On ${WEEKDAY_LABELS[w.weekday]}, a window must end after it starts.`);
        return;
      }
    }
    setSaving(true);
    try {
      await apiFetch("/api/providers/me/availability", {
        method: "PUT",
        body: { windows },
      });
      toast.success("Availability saved.");
      setDirty(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded || windows === null) {
    return (
      <Card className="py-0">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <CalendarClock className="size-4.5 text-primary" />
            Weekly working hours
          </span>
          <Button size="sm" onClick={save} disabled={saving || !dirty}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const dayWindows = windows
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => w.weekday === weekday);
          return (
            <div key={weekday} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
              <span className="w-28 shrink-0 pt-1.5 text-sm font-medium">
                {label}
                {weekday === new Date().getUTCDay() && (
                  <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                    today
                  </span>
                )}
              </span>

              <div className="flex flex-1 flex-col gap-2">
                {dayWindows.length === 0 && (
                  <p className="py-1 text-sm text-muted-foreground">Closed</p>
                )}
                {dayWindows.map(({ w, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <TimeSelect
                      value={w.startMin}
                      ariaLabel={`${label} window start`}
                      onChange={(v) => setWindow(i, { startMin: v })}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <TimeSelect
                      value={w.endMin}
                      ariaLabel={`${label} window end`}
                      onChange={(v) => setWindow(i, { endMin: v })}
                    />
                    <span className="text-xs text-muted-foreground">
                      ({fmtDuration(w.endMin - w.startMin)})
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      aria-label="Remove window"
                      onClick={() => update(windows.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() =>
                    update([...windows, { weekday, startMin: 9 * 60, endMin: 17 * 60 }])
                  }
                >
                  <Plus className="size-3.5" /> Add window
                </Button>
              </div>
            </div>
          );
        })}
        <p className="pt-3 text-xs text-muted-foreground">
          Times are in the business timezone (UTC). Bookings must fit entirely
          inside one window; overlapping windows are rejected.
        </p>
      </CardContent>
    </Card>
  );
}

function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-24 tabular-nums" aria-label={ariaLabel}>
        {minutesToTime(value)}
      </SelectTrigger>
      <SelectContent className="max-h-64">
        {TIME_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)} className="tabular-nums">
            {minutesToTime(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
