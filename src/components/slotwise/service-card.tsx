"use client";

import { CalendarClock, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "@/components/slotwise/star-rating";
import { useUIStore } from "@/store/ui-store";
import { fmtDuration, fmtMoney, fmtDateShortUTC, fmtTimeUTC, initials } from "@/lib/format";
import type { ServiceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ServiceCardProps {
  service: ServiceDTO;
  onBook: (serviceId: string) => void;
  className?: string;
}

export function ServiceCard({ service, onBook, className }: ServiceCardProps) {
  const openProfile = useUIStore((s) => s.openProfile);
  const next = service.nextAvailableAt;

  return (
    <Card
      className={cn(
        "group flex h-full flex-col gap-0 py-0 transition-all hover:-translate-y-0.5 hover:shadow-lg",
        className,
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {service.category}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" />
              {fmtDuration(service.durationMin)}
            </span>
          </div>
          <span className="text-lg font-bold tabular-nums">
            {fmtMoney(service.price)}
          </span>
        </div>

        <div>
          <h3 className="font-semibold leading-snug tracking-tight group-hover:text-primary">
            {service.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {service.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {service.providers.length > 0 ? (
            service.providers.slice(0, 3).map((p) => (
              <button
                key={p.id}
                type="button"
                className="group/p inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title={`View ${p.name}'s profile`}
                aria-label={`View ${p.name}'s profile`}
                onClick={(e) => {
                  e.stopPropagation();
                  openProfile(p.id);
                }}
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground transition-transform group-hover/p:scale-110">
                  {initials(p.name)}
                </span>
                {p.name.split(" ").slice(-1)[0]}
              </button>
            ))
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3" /> Unassigned
            </span>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {service.reviewCount > 0 ? (
            <StarRating value={service.rating} count={service.reviewCount} />
          ) : (
            <span className="text-xs text-muted-foreground">No reviews yet</span>
          )}
          {next ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/60 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 sm:inline-flex dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CalendarClock className="size-3.5" />
              Next: {fmtDateShortUTC(next)} {fmtTimeUTC(next)}
            </span>
          ) : (
            <span className="hidden rounded-full border px-2.5 py-1 text-xs text-muted-foreground sm:inline-flex">
              No open slots this week
            </span>
          )}
        </div>
      </CardContent>

      <CardFooter className="border-t p-4">
        <Button
          className="w-full"
          disabled={!service.providers.length || !next}
          onClick={() => onBook(service.id)}
        >
          {service.providers.length === 0
            ? "No provider assigned"
            : !next
              ? "Fully booked"
              : "Book now"}
        </Button>
      </CardFooter>
    </Card>
  );
}
