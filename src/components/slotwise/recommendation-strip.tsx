"use client";

import { useMemo } from "react";
import { ArrowRight, Clock, Sparkles, Star, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useUIStore } from "@/store/ui-store";
import { useApiQuery } from "@/hooks/use-api-query";
import { fmtDuration, fmtMoney } from "@/lib/format";
import type { ServiceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface RecommendedResponse {
  items: ServiceDTO[];
  basis: "favorites" | "popular";
  /** serviceId → the hearted service name it was recommended from. */
  reasons: Record<string, string>;
}

/**
 * Personalised shortlist above the Browse grid: "Recommended for you"
 * (favourites-based, with reason chips) or "Popular right now" for guests
 * and users without hearts yet.
 */
export function RecommendationStrip() {
  const openBooking = useUIStore((s) => s.openBooking);
  const { data, loading } = useApiQuery<RecommendedResponse>(
    "/api/services/recommended?limit=4",
  );

  const personalised = data?.basis === "favorites";
  const items = data?.items ?? [];

  const header = useMemo(
    () =>
      loading
        ? null
        : personalised
          ? {
              title: "Recommended for you",
              sub: "Based on the services you've hearted.",
            }
          : {
              title: "Popular right now",
              sub: "Top-rated services other customers love.",
            },
    [loading, personalised],
  );

  if (loading) {
    return (
      <section aria-label="Recommended services" className="mb-6">
        <div className="mb-3 flex items-baseline gap-2">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-60 shrink-0 rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <section aria-label="Recommended services" className="mb-6">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <Sparkles
              className={cn(
                "size-4",
                personalised
                  ? "text-rose-500"
                  : "text-amber-500 dark:text-amber-400",
              )}
            />
            {header?.title}
          </h2>
          <p className="hidden text-xs text-muted-foreground sm:inline">
            {header?.sub}
          </p>
        </div>
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        {items.map((s) => (
          <article
            key={s.id}
            className="card-lift group flex w-60 shrink-0 snap-start flex-col gap-2.5 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary" className="font-normal">
                {s.category}
              </Badge>
              {s.reviewCount > 0 ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                  <span className="font-medium tabular-nums text-foreground">
                    {s.rating.toFixed(1)}
                  </span>
                  ({s.reviewCount})
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">New</span>
              )}
            </div>

            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">{s.name}</p>
              <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="size-3" /> {fmtDuration(s.durationMin)}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="size-3" /> {s.providers.length} provider
                  {s.providers.length === 1 ? "" : "s"}
                </span>
              </p>
            </div>

            {personalised && data?.reasons?.[s.id] ? (
              <p className="truncate rounded-md bg-rose-500/[0.08] px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
                ♥ Because you liked {data.reasons[s.id]}
              </p>
            ) : (
              <p className="truncate rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                {s.nextAvailableAt
                  ? `Next: ${new Date(s.nextAvailableAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "UTC",
                    })}`
                  : "Check availability"}
              </p>
            )}

            <div className="mt-auto flex items-center justify-between gap-2 pt-1">
              <span className="text-sm font-bold tabular-nums">
                {fmtMoney(s.price)}
              </span>
              <Button
                size="sm"
                className="press h-8"
                onClick={() => openBooking(s.id)}
              >
                Book
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
