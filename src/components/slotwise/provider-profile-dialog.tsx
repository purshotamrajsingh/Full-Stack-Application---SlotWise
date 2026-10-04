"use client";

import { useMemo } from "react";
import {
  CalendarClock,
  CalendarDays,
  Quote,
  Reply,
  Scissors,
  Star,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StarRating } from "@/components/slotwise/star-rating";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import type { ProviderProfileDTO } from "@/lib/types";
import {
  fmtDateShortUTC,
  fmtDuration,
  fmtMoney,
  initials,
  minutesToTime,
  WEEKDAY_SHORT,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Public provider profile: identity, weekly schedule, bookable services and
 * recent reviews. Opened from provider chips across the customer UI.
 */
export function ProviderProfileDialog() {
  const profileProviderId = useUIStore((s) => s.profileProviderId);
  const closeProfile = useUIStore((s) => s.closeProfile);
  const openBooking = useUIStore((s) => s.openBooking);

  const { data, loading, error } = useApiQuery<{ provider: ProviderProfileDTO }>(
    profileProviderId ? `/api/providers/${profileProviderId}` : null,
  );

  const provider = data?.provider;

  // Group availability windows by weekday for the schedule grid.
  const schedule = useMemo(() => {
    const byDay = new Map<number, { startMin: number; endMin: number }[]>();
    for (const w of provider?.availability ?? []) {
      const list = byDay.get(w.weekday) ?? [];
      list.push(w);
      byDay.set(w.weekday, list);
    }
    // Mon..Sun order (JS getUTCDay is Sun=0)
    return [1, 2, 3, 4, 5, 6, 0].map((weekday) => ({
      weekday,
      windows: (byDay.get(weekday) ?? []).sort((a, b) => a.startMin - b.startMin),
    }));
  }, [provider?.availability]);

  const today = new Date().getUTCDay();

  return (
    <Dialog
      open={profileProviderId !== null}
      onOpenChange={(next) => {
        if (!next) closeProfile();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto scrollbar-slim sm:max-w-2xl">
        {loading || !provider ? (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-4">
              <Skeleton className="size-16 rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Could not load this profile. {error}
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-4">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                  {initials(provider.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-xl leading-tight">
                    {provider.name}
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {provider.specialty && (
                      <span className="inline-flex items-center gap-1">
                        <Scissors className="size-3.5" />
                        {provider.specialty}
                      </span>
                    )}
                    {provider.reviewCount > 0 ? (
                      <StarRating value={provider.rating} count={provider.reviewCount} />
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-3.5" /> New on SlotWise
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {provider.bio && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {provider.bio}
              </p>
            )}

            {/* Weekly schedule */}
            <section aria-label="Weekly schedule">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarDays className="size-3.5" />
                Weekly schedule (UTC)
              </h3>
              <div className="grid grid-cols-7 gap-1.5">
                {schedule.map(({ weekday, windows }) => (
                  <div
                    key={weekday}
                    className={cn(
                      "flex min-h-16 flex-col items-center gap-1 rounded-lg border p-1.5 text-center",
                      weekday === today
                        ? "border-primary/50 bg-secondary/60"
                        : "bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase",
                        weekday === today ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAY_SHORT[weekday]}
                    </span>
                    {windows.length === 0 ? (
                      <span className="text-[10px] text-muted-foreground/60">—</span>
                    ) : (
                      windows.map((w) => (
                        <span key={w.startMin} className="text-[10px] font-medium tabular-nums leading-tight">
                          {minutesToTime(w.startMin)}
                          <br />
                          {minutesToTime(w.endMin)}
                        </span>
                      ))
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* Services */}
            <section aria-label="Services">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CalendarClock className="size-3.5" />
                Services ({provider.services.length})
              </h3>
              <div className="flex flex-col gap-2">
                {provider.services.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-lg border bg-card p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{s.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.category} · {fmtDuration(s.durationMin)}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums">
                      {fmtMoney(s.price)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => {
                        closeProfile();
                        openBooking(s.id);
                      }}
                    >
                      Book
                    </Button>
                  </div>
                ))}
                {provider.services.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No services assigned yet.
                  </p>
                )}
              </div>
            </section>

            <Separator />

            {/* Reviews */}
            <section aria-label="Reviews">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Quote className="size-3.5" />
                Recent reviews
              </h3>
              {provider.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No reviews yet — be the first after your visit.
                </p>
              ) : (
                <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 scrollbar-slim">
                  {provider.reviews.map((r, i) => (
                    <div key={i} className="rounded-lg bg-muted/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <StarRating value={r.rating} />
                        <span className="text-[10px] text-muted-foreground">
                          {fmtDateShortUTC(r.createdAt)}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="mt-1.5 text-sm leading-relaxed">
                          “{r.comment}”
                        </p>
                      )}
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <UserRound className="size-3" />
                        {r.authorName}
                        <Badge variant="secondary" className="ml-1 font-normal">
                          {r.serviceName}
                        </Badge>
                      </p>
                      {/* Business reply — nested bubble under the review */}
                      {r.reply && (
                        <div className="mt-2 rounded-lg border-l-2 border-primary/40 bg-background px-3 py-2">
                          <p className="flex flex-wrap items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Reply className="size-3 text-primary" />
                            Response from {provider.name}
                            {r.repliedAt && (
                              <span className="font-normal normal-case tracking-normal">
                                · {fmtDateShortUTC(r.repliedAt)}
                              </span>
                            )}
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                            {r.reply}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
