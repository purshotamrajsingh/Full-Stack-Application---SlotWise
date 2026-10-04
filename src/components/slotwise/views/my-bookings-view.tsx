"use client";

import { useMemo, useState } from "react";
import {
  Bell,
  BellRing,
  CalendarPlus,
  CalendarX2,
  CalendarRange,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareHeart,
  PencilLine,
  RotateCcw,
  Sparkles,
  Trash2,
  Wallet,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { useAuthStore } from "@/store/auth-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { useRealtime, useNotifications } from "@/hooks/use-realtime";
import { apiFetch, downloadIcs } from "@/lib/client-api";
import type { BookingDTO, WaitlistDTO } from "@/lib/types";
import { fmtDateUTC, fmtDuration, fmtMoney, fmtTimeUTC, isPast } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tab = "upcoming" | "past" | "cancelled" | "waitlist";

export function MyBookingsView() {
  const openReschedule = useUIStore((s) => s.openReschedule);
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("upcoming");
  const [cancelTarget, setCancelTarget] = useState<BookingDTO | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingDTO | null>(null);
  const [reviewEditMode, setReviewEditMode] = useState(false);
  const [deleteReviewTarget, setDeleteReviewTarget] = useState<BookingDTO | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, loading, error, reload } = useApiQuery<{ items: BookingDTO[] }>(
    "/api/bookings?sort=date_desc",
  );
  const {
    data: wlData,
    loading: wlLoading,
    reload: wlReload,
  } = useApiQuery<{ items: WaitlistDTO[] }>("/api/waitlist");
  const wlItems = wlData?.items ?? [];

  // Live updates: when the provider confirms/completes one of this user's
  // bookings (or a reschedule lands), refresh the list and say what changed.
  useRealtime((msg) => {
    if (msg.booking.customerId !== user?.id) return;
    reload();
    if (msg.actorId === user?.id) return;
    if (msg.type === "booking:status") {
      toast.info(`Booking ${msg.booking.status.toLowerCase()} — ${msg.booking.serviceName}`, {
        description: `${msg.booking.providerName} · ${fmtDateUTC(msg.booking.startAt)} ${fmtTimeUTC(msg.booking.startAt)}`,
      });
    }
  });

  // A watched slot just freed up — refresh the waitlist tab so the entry
  // flips to "alerted" while the bell toast is still on screen.
  useNotifications((msg) => {
    if (msg.type === "waitlist_opened") wlReload();
  });

  // Remove a review (only offered inside the 15-minute edit window).
  async function deleteReview() {
    if (!deleteReviewTarget?.review) return;
    setBusyId(deleteReviewTarget.id);
    try {
      await apiFetch(`/api/reviews/${deleteReviewTarget.review.id}`, { method: "DELETE" });
      toast.success("Review removed.");
      setDeleteReviewTarget(null);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove review.");
    } finally {
      setBusyId(null);
    }
  }

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

  const lists: Record<Exclude<Tab, "waitlist">, BookingDTO[]> = grouped;

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
    waitlist: {
      title: "Not watching any slots",
      description:
        "Tap the little bell on a taken slot in the booking calendar — we'll ping you the moment it frees up.",
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
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
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
          <TabsTrigger value="waitlist" className="gap-1.5">
            Waitlist
            <CountPill n={wlItems.filter((w) => !w.notifiedAt).length} />
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? (
        <EmptyState icon={CalendarX2} title="Could not load bookings" description={error} />
      ) : tab === "waitlist" ? (
        wlLoading && wlItems.length === 0 ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : wlItems.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title={emptyCopy.waitlist.title}
            description={emptyCopy.waitlist.description}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {wlItems.map((w) => (
              <WaitlistCard key={w.id} entry={w} onChanged={wlReload} />
            ))}
          </div>
        )
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
              onReview={() => {
                setReviewEditMode(false);
                setReviewTarget(b);
              }}
              onEditReview={() => {
                setReviewEditMode(true);
                setReviewTarget(b);
              }}
              onDeleteReview={() => setDeleteReviewTarget(b)}
              onNotesSaved={reload}
            />
          ))}
        </div>
      )}

      <ReviewDialog
        booking={reviewTarget}
        mode={reviewEditMode ? "edit" : "create"}
        onClose={() => setReviewTarget(null)}
        onReviewed={reload}
      />

      <AlertDialog
        open={deleteReviewTarget !== null}
        onOpenChange={(o) => !o && setDeleteReviewTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this review?</AlertDialogTitle>
            <AlertDialogDescription>
              Your rating and comment for {deleteReviewTarget?.serviceName} with{" "}
              {deleteReviewTarget?.providerName} will be removed. You can leave
              a new review afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep review</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={deleteReview}
              disabled={busyId !== null}
            >
              Delete review
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

/** One watched slot: "alert me the moment this frees up". */
function WaitlistCard({
  entry,
  onChanged,
}: {
  entry: WaitlistDTO;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const alerted = Boolean(entry.notifiedAt);

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/waitlist/${entry.id}`, { method: "DELETE" });
      toast.info("Stopped watching that slot.");
      onChanged();
    } catch {
      toast.error("Could not remove the watch.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn(
        "card-lift py-0 hover:border-primary/40",
        alerted && "border-violet-500/30",
        busy && "opacity-50",
      )}
    >
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={cn(
              "flex size-12 shrink-0 items-center justify-center rounded-lg",
              alerted
                ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {alerted ? (
              <Sparkles className="size-5" />
            ) : (
              <Bell className="size-5 animate-pulse" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight">{entry.serviceName}</p>
              {alerted ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                  <Sparkles className="size-3" /> Slot opened — go book it
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-1.5 animate-ping rounded-full bg-amber-500 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
                  </span>
                  Watching
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              with {entry.providerName} · {fmtDateUTC(entry.startAt)} at{" "}
              {fmtTimeUTC(entry.startAt)} · {fmtDuration(entry.durationMin)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              {alerted
                ? "We pinged you when this slot freed up — it may be gone again, so check the calendar."
                : "We'll notify you the moment this slot frees up."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
          <span className="text-base font-bold tabular-nums">{fmtMoney(entry.price)}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={remove}
            disabled={busy}
            className="hover:text-destructive"
          >
            <Trash2 className="size-3.5" /> Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Inline editor for the customer's booking note (pending/confirmed only). */
function NotesEditor({
  booking,
  onSaved,
}: {
  booking: BookingDTO;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(booking.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await apiFetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        body: { notes: value.trim() ? value.trim() : null },
      });
      toast.success("Note updated.");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValue(booking.notes ?? "");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className={cn(booking.notes && "border-primary/40")}
          aria-label="Edit booking note"
        >
          <PencilLine className="size-3.5" />
          {booking.notes ? "Note" : "Add note"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">Booking note</p>
            <p className="text-xs text-muted-foreground">
              Visible to {booking.providerName} when they open the diary.
            </p>
          </div>
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="e.g. Running 5 minutes late, sorry!"
            aria-label="Booking note"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {value.length}/300
            </span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Discard
              </Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                Save note
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Reviews stay editable for this many minutes after posting (mirrors the API). */
const REVIEW_EDIT_WINDOW_MIN = 15;

function BookingCard({
  booking,
  busy,
  onReschedule,
  onCancel,
  onReview,
  onEditReview,
  onDeleteReview,
  onNotesSaved,
}: {
  booking: BookingDTO;
  busy: boolean;
  onReschedule: () => void;
  onCancel: () => void;
  onReview: () => void;
  onEditReview: () => void;
  onDeleteReview: () => void;
  onNotesSaved: () => void;
}) {
  const active = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const canReview = booking.status === "COMPLETED" && !booking.review;
  const reviewMinsLeft = booking.review
    ? Math.max(
        0,
        REVIEW_EDIT_WINDOW_MIN -
          Math.floor((Date.now() - new Date(booking.review.createdAt).getTime()) / 60_000),
      )
    : 0;
  const reviewEditable = Boolean(booking.review) && reviewMinsLeft > 0;

  return (
    <Card
      className={cn(
        "card-lift py-0 hover:border-primary/40",
        busy && "opacity-50",
      )}
    >
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
                {reviewEditable && (
                  <span className="inline-flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                      onClick={onEditReview}
                      disabled={busy}
                      title="Edit your review"
                    >
                      <PencilLine className="size-3" /> Edit
                      <span className="text-[10px] text-muted-foreground/70">{reviewMinsLeft}m</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={onDeleteReview}
                      disabled={busy}
                      title="Delete your review"
                    >
                      <Trash2 className="size-3" /> Delete
                    </Button>
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
                <NotesEditor booking={booking} onSaved={onNotesSaved} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  title="Download calendar invite"
                  onClick={() =>
                    downloadIcs(booking.id).catch((err) =>
                      toast.error(
                        err instanceof Error ? err.message : "Download failed.",
                      ),
                    )
                  }
                >
                  <CalendarPlus className="size-3.5" /> Calendar
                </Button>
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
    <Card className="py-0 transition-shadow duration-200 hover:shadow-md">
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
