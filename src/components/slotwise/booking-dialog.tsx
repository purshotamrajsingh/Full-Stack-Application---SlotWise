"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  Clock,
  Loader2,
  LogIn,
  Plane,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/slotwise/star-rating";
import { useAuthStore } from "@/store/auth-store";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSlotsWatch, useTimeOffWatch } from "@/hooks/use-realtime";
import { apiFetch, downloadIcs } from "@/lib/client-api";
import type { BookingDTO, ServiceDTO, SlotDTO } from "@/lib/types";
import {
  addDaysKey,
  fmtDateShortUTC,
  fmtDateUTC,
  fmtDuration,
  fmtMoney,
  fmtTimeUTC,
  slotGroupLabel,
  todayKey,
  WEEKDAY_SHORT,
} from "@/lib/format";
import { cn } from "@/lib/utils";

interface SlotsResponse {
  slots: SlotDTO[];
  durationMin: number;
  /** Time-off windows overlapping the viewed day (public info). */
  timeOff?: { startAt: string; endAt: string; reason: string }[];
}

const DAYS_AHEAD = 14;

export function BookingDialog() {
  const user = useAuthStore((s) => s.user);
  const bookingServiceId = useUIStore((s) => s.bookingServiceId);
  const rescheduleBookingId = useUIStore((s) => s.rescheduleBookingId);
  const closeBooking = useUIStore((s) => s.closeBooking);
  const goAuth = useUIStore((s) => s.goAuth);
  const nav = useUIStore((s) => s.nav);

  const open = bookingServiceId !== null || rescheduleBookingId !== null;
  const rescheduleMode = rescheduleBookingId !== null;

  const [service, setService] = useState<ServiceDTO | null>(null);
  const [existing, setExisting] = useState<BookingDTO | null>(null);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [date, setDate] = useState(todayKey());
  const [selectedSlot, setSelectedSlot] = useState<SlotDTO | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  /** Freshly created booking (success screen's "Add to calendar"). */
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Resolve service (create) or booking (reschedule) when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedSlot(null);
    setNotes("");
    setDate(todayKey());
    setProviderId(null);
    setService(null);
    setExisting(null);
    setCreatedId(null);

    if (rescheduleBookingId) {
      apiFetch<{ items: BookingDTO[] }>("/api/bookings")
        .then((res) => {
          const booking = res.items.find((b) => b.id === rescheduleBookingId);
          if (!booking) {
            toast.error("Booking not found.");
            closeBooking();
            return;
          }
          setExisting(booking);
          setProviderId(booking.providerId);
          setStep(2);
        })
        .catch(() => toast.error("Could not load the booking."));
    }
  }, [open, rescheduleBookingId, closeBooking]);

  useEffect(() => {
    if (!open || rescheduleBookingId) return;
    apiFetch<{ items: ServiceDTO[] }>("/api/services")
      .then((res) => {
        const svc = res.items.find((s) => s.id === bookingServiceId);
        if (!svc) {
          toast.error("Service not found.");
          closeBooking();
          return;
        }
        setService(svc);
        if (svc.providers.length === 1) {
          setProviderId(svc.providers[0]!.id);
          setStep(2);
        }
      })
      .catch(() => toast.error("Could not load the service."));
  }, [open, bookingServiceId, rescheduleBookingId, closeBooking]);

  const effectiveServiceId = rescheduleMode
    ? existing?.serviceId ?? null
    : bookingServiceId;

  const slotsPath = useMemo(
    () =>
      providerId && effectiveServiceId
        ? `/api/providers/${providerId}/slots?date=${date}&serviceId=${effectiveServiceId}`
        : null,
    [providerId, effectiveServiceId, date],
  );
  const { data: slotsData, loading: slotsLoading, reload: reloadSlots } =
    useApiQuery<SlotsResponse>(open && step === 2 ? slotsPath : null);

  // Live slot grid: follow this provider's public availability channel while
  // the picker is open. If someone else takes a slot on the viewed date, the
  // grid refreshes instantly — and if they took the slot this user had
  // selected, bounce them back to the grid with a warning.
  const { connected: slotsLive } = useSlotsWatch(
    open && step === 2 ? providerId : null,
    open && step === 2 ? date : null,
    (msg) => {
      if (msg.providerId !== providerId || msg.date !== date) return;
      reloadSlots();
      if (
        selectedSlot &&
        msg.startAt <= selectedSlot.endAt &&
        msg.endAt >= selectedSlot.startAt
      ) {
        setSelectedSlot(null);
        toast.error("Someone just took that slot", {
          description: "The grid has been updated — pick a new time.",
        });
      }
    },
  );

  // The provider's time off can also change while the picker is open —
  // (they block a holiday from another tab) — refresh the grid when it does.
  useTimeOffWatch(open && step === 2 ? providerId : null, (msg) => {
    if (msg.providerId !== providerId) return;
    if (!msg.dates.includes(date)) return;
    reloadSlots();
    setSelectedSlot(null);
    toast.info("Availability just changed", {
      description: "The provider updated their schedule — the grid has been refreshed.",
    });
  });

  const chosenProvider = service?.providers.find((p) => p.id === providerId);
  const durationMin = rescheduleMode
    ? existing?.durationMin ?? 0
    : service?.durationMin ?? 0;
  const price = rescheduleMode ? existing?.price ?? 0 : service?.price ?? 0;
  const serviceName = rescheduleMode ? existing?.serviceName : service?.name;
  const dates = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDaysKey(todayKey(), i)),
    [],
  );

  const slots = slotsData?.slots ?? [];
  /** The time-off window covering most of this day, if any (for the banner). */
  const dayBlocked = (slotsData?.timeOff ?? []).find(
    (w) => w.startAt.slice(0, 10) <= date && w.endAt.slice(0, 10) > date,
  );
  const grouped = useMemo(() => {
    const groups = new Map<string, SlotDTO[]>();
    for (const s of slots) {
      const hour = new Date(s.startAt).getUTCHours();
      const label = slotGroupLabel(hour);
      const list = groups.get(label) ?? [];
      list.push(s);
      groups.set(label, list);
    }
    return [...groups.entries()];
  }, [slots]);

  async function confirm() {
    if (!selectedSlot || !providerId || !effectiveServiceId) return;
    setSubmitting(true);
    try {
      if (rescheduleMode && existing) {
        await apiFetch<{ booking: BookingDTO }>(
          `/api/bookings/${existing.id}`,
          { method: "PATCH", body: { startAt: selectedSlot.startAt } },
        );
        toast.success("Booking rescheduled.");
        setStep(4);
      } else {
        const res = await apiFetch<{ booking: BookingDTO }>("/api/bookings", {
          method: "POST",
          body: {
            serviceId: effectiveServiceId,
            providerId,
            startAt: selectedSlot.startAt,
            notes: notes.trim() || undefined,
          },
        });
        setCreatedId(res.booking.id);
        toast.success("Booking confirmed — see you soon!");
        setStep(4);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Booking failed.";
      toast.error(message);
      setStep(2);
      setSelectedSlot(null);
      reloadSlots();
    } finally {
      setSubmitting(false);
    }
  }

  const titles: Record<number, string> = {
    1: "Choose a provider",
    2: rescheduleMode ? "Pick a new time" : "Pick a time",
    3: "Confirm your booking",
    4: rescheduleMode ? "Rescheduled" : "You're booked in",
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeBooking();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-slim sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {step === 4 ? (
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <CalendarCheck className="size-5 text-primary" />
            )}
            {titles[step]}
          </DialogTitle>
          <DialogDescription>
            {serviceName ?? "…"}
            {durationMin > 0 && (
              <>
                {" · "}
                {fmtDuration(durationMin)}
                {price > 0 && ` · ${fmtMoney(price)}`}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Login gate */}
        {step < 4 && !user && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-6 py-8 text-center">
            <LogIn className="size-8 text-muted-foreground" />
            <p className="font-medium">Sign in to book</p>
            <p className="text-sm text-muted-foreground">
              Create a free account — it takes 20 seconds and keeps your booking
              history in one place.
            </p>
            <Button onClick={() => goAuth("Sign in to finish your booking")}>
              Sign in or create an account
            </Button>
          </div>
        )}

        {/* Step 1 — provider */}
        {step === 1 && user && service && (
          <div className="flex flex-col gap-2">
            {service.providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setProviderId(p.id);
                  setStep(2);
                }}
                className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-secondary/60"
              >
                <div className="min-w-0">
                  <p className="font-medium">{p.name}</p>
                  {p.specialty && (
                    <p className="truncate text-sm text-muted-foreground">
                      {p.specialty}
                    </p>
                  )}
                  {p.reviewCount > 0 && (
                    <StarRating value={p.rating} count={p.reviewCount} className="mt-1" />
                  )}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — date & time */}
        {step === 2 && user && (
          <div className="flex flex-col gap-4">
            {step === 2 && providerId && !rescheduleMode && chosenProvider && (
              <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{chosenProvider.name}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setStep(1);
                    setSelectedSlot(null);
                  }}
                >
                  change
                </button>
              </div>
            )}

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
              {dates.map((d) => {
                const dt = new Date(`${d}T00:00:00.000Z`);
                const isToday = d === todayKey();
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDate(d);
                      setSelectedSlot(null);
                    }}
                    className={cn(
                      "flex w-14 shrink-0 flex-col items-center gap-0.5 rounded-lg border px-2 py-2 text-center transition-colors",
                      date === d
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:border-primary/40 hover:bg-secondary/60",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase",
                        date === d ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAY_SHORT[dt.getUTCDay()]}
                    </span>
                    <span className="text-sm font-bold tabular-nums">
                      {dt.getUTCDate()}
                    </span>
                    <span
                      className={cn(
                        "text-[10px]",
                        date === d ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {isToday ? "today" : dt.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}
                    </span>
                  </button>
                );
              })}
            </div>

            {slotsLoading ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                <CalendarX2 className="size-6" />
                No working hours on this day — try another date.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {dayBlocked && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm">
                    <Plane className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="text-amber-800 dark:text-amber-300">
                      <span className="font-semibold">Away on this day</span>
                      {dayBlocked.reason && <> — {dayBlocked.reason}</>}
                      <span className="block text-xs opacity-80">
                        Pick another day, or check a different provider.
                      </span>
                    </p>
                  </div>
                )}
                {slotsLive && !dayBlocked && (
                  <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-2 animate-ping rounded-full bg-emerald-500 opacity-60" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    Live availability — greyed slots are already taken
                  </p>
                )}
                {grouped.map(([label, group]) => (
                  <div key={label}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {group.map((s) => (
                        <button
                          key={s.startAt}
                          type="button"
                          disabled={!s.available}
                          onClick={() => setSelectedSlot(s)}
                          className={cn(
                            "rounded-md border px-2 py-2 text-sm font-medium tabular-nums transition-colors",
                            !s.available
                              ? "cursor-not-allowed border-muted bg-muted/40 text-muted-foreground/50 line-through"
                              : selectedSlot?.startAt === s.startAt
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:border-primary/50 hover:bg-secondary/60",
                          )}
                        >
                          {fmtTimeUTC(s.startAt)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              disabled={!selectedSlot}
              onClick={() => setStep(3)}
              className="w-full"
            >
              Continue
              <ArrowRight className="size-4" />
            </Button>
          </div>
        )}

        {/* Step 3 — confirm */}
        {step === 3 && user && selectedSlot && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-col gap-2 text-sm">
                <Row label="Service" value={serviceName ?? "—"} />
                <Row
                  label="Provider"
                  value={
                    rescheduleMode
                      ? existing?.providerName ?? "—"
                      : chosenProvider?.name ?? "—"
                  }
                />
                <Row label="Date" value={fmtDateUTC(selectedSlot.startAt)} />
                <Row
                  label="Time"
                  value={`${fmtTimeUTC(selectedSlot.startAt)} – ${fmtTimeUTC(selectedSlot.endAt)} (UTC)`}
                />
                <Row label="Duration" value={fmtDuration(durationMin)} />
                <div className="mt-1 flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{fmtMoney(price)}</span>
                </div>
              </div>
            </div>

            {!rescheduleMode && (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="booking-notes"
                  className="text-sm font-medium"
                >
                  Notes for the provider <span className="text-muted-foreground">(optional)</span>
                </label>
                <Textarea
                  id="booking-notes"
                  placeholder="Anything they should know? Parking, access, preferences…"
                  value={notes}
                  maxLength={300}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button className="flex-1" onClick={confirm} disabled={submitting}>
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {rescheduleMode ? "Confirm reschedule" : "Confirm booking"}
              </Button>
            </div>
          </div>
        )}

        {/* Step 4 — success */}
        {step === 4 && selectedSlot && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <div className="flex size-16 animate-in zoom-in-50 duration-500 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <CheckCircle2 className="size-9 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-semibold">{serviceName}</p>
              <p className="mt-1 flex items-center justify-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                {fmtDateUTC(selectedSlot.startAt)} · {fmtTimeUTC(selectedSlot.startAt)} –{" "}
                {fmtTimeUTC(selectedSlot.endAt)}
              </p>
              {!rescheduleMode && (
                <Badge variant="secondary" className="mt-3">
                  Status: Pending confirmation
                </Badge>
              )}
            </div>
            {!rescheduleMode && createdId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  downloadIcs(createdId).catch((err) =>
                    toast.error(err instanceof Error ? err.message : "Download failed."),
                  )
                }
              >
                <CalendarPlus className="size-4" />
                Add to calendar (.ics)
              </Button>
            )}
            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  closeBooking();
                  nav("bookings");
                }}
              >
                View my bookings
              </Button>
              <Button className="flex-1" onClick={closeBooking}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
