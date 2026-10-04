"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  CalendarCheck2,
  CalendarX2,
  CheckCheck,
  CircleAlert,
  Clock3,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { useNotifications } from "@/hooks/use-realtime";
import { apiFetch } from "@/lib/client-api";
import type { NotificationDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  string,
  { icon: typeof Bell; ring: string; chime: typeof toast.success }
> = {
  booking_created: {
    icon: CalendarCheck2,
    ring: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    chime: toast.success,
  },
  booking_status: {
    icon: Clock3,
    ring: "bg-primary/15 text-primary",
    chime: toast.info,
  },
  booking_cancelled: {
    icon: CalendarX2,
    ring: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    chime: toast.error,
  },
  booking_rescheduled: {
    icon: Clock3,
    ring: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    chime: toast.info,
  },
  time_off_conflict: {
    icon: CircleAlert,
    ring: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    chime: toast.warning,
  },
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Header bell — the mock email outbox's inbox view. Live: new notifications
 * arrive over the realtime hub (badge bump + toast) without polling.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const { data, loading, reload } = useApiQuery<{ items: NotificationDTO[]; unread: number }>(
    "/api/notifications?limit=20",
  );
  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  // Live push: badge + toast the moment a notification is created server-side.
  useNotifications((msg) => {
    reload();
    const meta = TYPE_META[msg.type];
    if (meta) {
      meta.chime(msg.title, { description: msg.body });
    } else {
      toast(msg.title);
    }
  });

  async function markAllRead() {
    if (unread === 0) return;
    setMarking(true);
    try {
      await apiFetch("/api/notifications/read-all", { method: "POST" });
      reload();
    } catch {
      toast.error("Could not mark notifications as read.");
    } finally {
      setMarking(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          {unread > 0 ? (
            <BellRing className="size-4.5" />
          ) : (
            <Bell className="size-4.5" />
          )}
          {unread > 0 && (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold tabular-nums text-destructive-foreground",
                "animate-in zoom-in-50 duration-300",
              )}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={marking || unread === 0}
            onClick={markAllRead}
          >
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-slim">
          {loading && items.length === 0 ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
              <Inbox className="size-8 opacity-50" />
              <p className="font-medium text-foreground">All caught up</p>
              <p className="text-xs">
                Booking receipts and schedule changes land here — like an
                inbox for your appointments.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = TYPE_META[n.type] ?? {
                  icon: Bell,
                  ring: "bg-muted text-muted-foreground",
                };
                const Icon = meta.icon;
                return (
                  <li
                    key={n.id}
                    data-notify-at={n.createdAt}
                    className={cn(
                      "flex gap-3 px-4 py-3 transition-colors",
                      !n.readAt && "bg-primary/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        meta.ring,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm leading-snug",
                            n.readAt ? "font-medium" : "font-semibold",
                          )}
                        >
                          {n.title}
                        </p>
                        {!n.readAt && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {timeAgo(n.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t px-4 py-2.5 text-center text-[11px] text-muted-foreground">
          Mock outbox — mirrors the emails a production build would send.
        </p>
      </PopoverContent>
    </Popover>
  );
}
