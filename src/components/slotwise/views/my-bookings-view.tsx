"use client";

import { useMemo, useState } from "react";
import {
  CalendarX2,
  CalendarRange,
  CheckCircle2,
  Clock,
  MessageSquareHeart,
  RotateCcw,
  Sparkles,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/slotwise/status-badge";
import { StarRating } from "@/components/slotwise/star-rating";
import { EmptyState } from "@/components/slotwise/empty-state";
import { ReviewDialog } from "@/components/slotwise/review-dialog";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { BookingDTO } from "@/lib/types";
import { fmtDateUTC, fmtDuration, fmtMoney, fmtTimeUTC, isPast } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "past" | "cancelled";

export function MyBookingsView() {
  const openReschedule = useUIStore((s) => s.openReschedule);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancelTarget, setCancelTarget] = useState<BookingDTO | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiQuery<{ items: BookingDTO[] }>(
    "/api/bookings?sort=date_desc",
  );

  const items = data?.items ?? [];

  const grouped = useMemo(() => {
    const upcoming: BookingDTO[] = [];
    const past: BookingDTO[] = [];
    const cancelled: BookingDTO[] = [];
    for (const b of items) {
      if (b.status === "CANCELLED" || b.status === "NO_SHOW") cancelled.push(b);
      else if (isPast(b.startAt) || b.status === "COMPLETED") past.push(b);
      else upcoming.push(b);
    }
    upcoming.sort((a, b) => a.startAt.localeCompare(b.startAt));
    past.sort((a, b) => b.startAt.localeCompare(a.startAt));
    return { upcoming, past, cancelled };
  }, [items]);

  async function cancelBooking(booking: BookingDTO) {
    setBusyId(booking.id);
    try {
      await apiFetch(`/api/bookings/${booking.id}`, { method: "DELETE" });
      toast.success("Booking cancelled.");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setBusyId(null);
      setCancelTarget(null);
    }
  }

  const lists: Record<Tab, BookingDTO[]> = grouped;

  // Customer lifetime stats (all computed client-side from the booking list).
  const stats = useMemo(() => {
    const completed = items.filter((b) => b.status === "COMPLETED");
    const spend = completed.reduce((s, b) => s + b.price, 0);
    const next = grouped.upcoming[0] ?? null;
    let countdown: string | null = null;
    if (next) {
      const days = Math.ceil(
        (new Date(next.startAt).getTime() - Date.now()) / 86_400_000,
      );
      countdown =
        days <= 0
          ? "today"
          : days === 1
            ? "tomorrow"
            : `in ${days} days`;
    }
    return {
      spend,
      visits: completed.length,
      next,
      countdown,
    };
  }, [items, grouped.upcoming]);

  const emptyCopy: Record<Tab, { title: string; description: string }> = {
    upcoming: {
      title: "No upcoming bookings",
      description: "Browse services and grab your next slot in three clicks.",
    },
    past: {
      title: "No past appointments yet",
      description: "Completed visits and their reviews will appear here.",
    },
    cancelled: {
      title: "Nothing cancelled",
      description: "Cancelled and missed appointments would show up here.",
    },
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My bookings</h1>
        <p className="mt-1 text-muted-foreground">
          Reschedule, cancel or review — all in one place.
        </p>
      </div>

      {/* Lifetime stats */}
      {loading ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CustomerStat
            icon={Sparkles}
            label="Next visit"
            value={stats.next ? stats.countdown ?? "soon" : "—"}
            sub={stats.next ? `${stats.next.serviceName}` : "Nothing booked"}
          />
          <CustomerStat
            icon={CalendarRange}
            label="Upcoming"
            value={String(grouped.upcoming.length)}
            sub="appointments"
          />
          <CustomerStat
            icon={CheckCircle2}
            label="Visits"
            value={String(stats.visits)}
            sub="completed all-time"
          />
          <CustomerStat
            icon={Wallet}
            label="Total spend"
            value={fmtMoney(stats.spend)}
            sub="completed visits"
          />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upcoming" className="gap-1.5">
            Upcoming
            <CountPill n={grouped.upcoming.length} />
          </TabsTrigger>
          <TabsTrigger value="past" className="gap-1.5">
            Past
            <CountPill n={grouped.past.length} />
          </TabsTrigger>
          <TabsTrigger value="cancelled" className="gap-1.5">
            Cancelled
            <CountPill n={grouped.cancelled.length} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <EmptyState icon={CalendarX2} title="Could not load bookings" description={error} />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : lists[tab].length === 0 ? (
        <EmptyState
          icon={tab === "upcoming" ? CalendarRange : tab === "past" ? CheckCircle2 : XCircle}
          title={emptyCopy[tab].title}
          description={emptyCopy[tab].description}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {lists[tab].map((b) => (
            <BookingCard
              key={b.id}
              booking={b}
              busy={busyId === b.id}
              onReschedule={() => openReschedule(b.id)}
              onCancel={() => setCancelTarget(b)}
              onReview={() => setReviewTarget(b)}
            />
          ))}
        </div>
      )}

      <ReviewDialog
        booking={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onReviewed={reload}
      />

      <AlertDialog open={cancelTarget !== null} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.serviceName} with {cancelTarget?.providerName} on{" "}
              {cancelTarget ? fmtDateUTC(cancelTarget.startAt) : ""} at{" "}
              {cancelTarget ? fmtTimeUTC(cancelTarget.startAt) : ""}. The slot is
              released immediately for others to book.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => cancelTarget && cancelBooking(cancelTarget)}
            >
              Yes, cancel it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CountPill({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold text-secondary-foreground">
      {n}
    </span>
  );
}

function BookingCard({
  booking,
  busy,
  onReschedule,
  onCancel,
  onReview,
}: {
  booking: BookingDTO;
  busy: boolean;
  onReschedule: () => void;
  onCancel: () => void;
  onReview: () => void;
}) {
  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const canReview = booking.status === "COMPLETED" && !booking.review;

  return (
    <Card className={cn("py-0 transition-opacity", busy && "opacity-50")}>
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="flex w-16 shrink-0 flex-col items-center rounded-lg border bg-muted/50 py-2">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              {new Date(booking.startAt).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}
            </span>
            <span className="text-xl font-bold leading-none tabular-nums">
              {new Date(booking.startAt).getUTCDate()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(booking.startAt).getUTCDay() === new Date().getUTCDay() ? "today" : ""}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight">{booking.serviceName}</p>
              <StatusBadge status={booking.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              with {booking.providerName} · {fmtTimeUTC(booking.startAt)}–{fmtTimeUTC(booking.endAt)} ·{" "}
              {fmtDuration(booking.durationMin)}
            </p>
            {booking.notes && (
              <p className="mt-1 line-clamp-1 text-xs italic text-muted-foreground">
                “{booking.notes}”
              </p>
            )}
            {booking.review && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StarRating value={booking.review.rating} />
                {booking.review.comment && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    “{booking.review.comment}”
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <span className="text-base font-bold tabular-nums">{fmtMoney(booking.price)}</span>
          <div className="flex flex-wrap gap-1.5">
            {active && (
              <>
                <Button size="sm" variant="outline" onClick={onReschedule} disabled={busy}>
                  <RotateCcw className="size-3.5" /> Reschedule
                </Button>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
                  <XCircle className="size-3.5" /> Cancel
                </Button>
              </>
            )}
            {canReview && (
              <Button size="sm" onClick={onReview} disabled={busy}>
                <MessageSquareHeart className="size-3.5" /> Leave a review
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomerStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-lg font-bold leading-tight tabular-nums">{value}</p>
          {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
