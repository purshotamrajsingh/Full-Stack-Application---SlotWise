"use client";

import { useState } from "react";
import {
  Bell,
  BellRing,
  CalendarCheck2,
  CalendarPlus,
  CalendarX2,
  CheckCheck,
  CircleAlert,
  Clock3,
  Inbox,
  Megaphone,
  Sparkles,
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
import type { NotificationDTO, WaitlistAlertMeta } from "@/lib/types";
import { useUIStore } from "@/store/ui-store";
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
  waitlist_opened: {
    icon: Sparkles,
    ring: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    chime: toast.success,
  },
  broadcast: {
    icon: Megaphone,
    ring: "bg-primary/15 text-primary",
    chime: toast.info,
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
 * Safely parse a waitlist alert's meta payload into a deep-link descriptor.
 * Returns null for old notifications (meta null) or malformed JSON — those
 * rows simply render without the inline action.
 */
function parseWaitlistMeta(raw: string | null): WaitlistAlertMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WaitlistAlertMeta>;
    if (
      typeof parsed.serviceId === "string" &&
      typeof parsed.providerId === "string" &&
      typeof parsed.startAt === "string" &&
      typeof parsed.endAt === "string"
    ) {
      return parsed as WaitlistAlertMeta;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Header bell — the mock email outbox's inbox view. Live: new notifications
 * arrive over the realtime hub (badge bump + toast) without polling.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const nav = useUIStore((s) => s.nav);
  const openBooking = useUIStore((s) => s.openBooking);

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

  /** Click a single unread item to mark just that one read. */
  async function markOneRead(id: string) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: "POST" });
      reload();
    } catch {
      /* best-effort — the dot simply stays */
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
            <ul className="list-row-hover divide-y">
              {items.map((n) => {
                const meta = TYPE_META[n.type] ?? {
                  icon: Bell,
                  ring: "bg-muted text-muted-foreground",
                };
                const Icon = meta.icon;
                const waitlistMeta =
                  n.type === "waitlist_opened"
                    ? parseWaitlistMeta(n.meta)
                    : null;
                return (
                  <li
                    key={n.id}
                    data-notify-at={n.createdAt}
                    role={n.readAt ? undefined : "button"}
                    tabIndex={n.readAt ? undefined : 0}
                    aria-label={n.readAt ? undefined : "Mark notification as read"}
                    onClick={n.readAt ? undefined : () => markOneRead(n.id)}
                    onKeyDown={
                      n.readAt
                        ? undefined
                        : (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              markOneRead(n.id);
                            }
                          }
                    }
                    className={cn(
                      "flex gap-3 px-4 py-3 transition-colors",
                      !n.readAt && "cursor-pointer bg-primary/[0.04] hover:bg-primary/[0.08]",
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
                      {waitlistMeta && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1.5 h-7 gap-1.5 border-violet-500/40 px-2.5 text-xs text-violet-700 hover:bg-violet-500/10 hover:text-violet-700 dark:border-violet-500/40 dark:text-violet-300 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            void markOneRead(n.id);
                            setOpen(false);
                            nav("browse");
                            openBooking(waitlistMeta.serviceId, {
                              providerId: waitlistMeta.providerId,
                              date: waitlistMeta.startAt.slice(0, 10),
                            });
                          }}
                        >
                          <CalendarPlus className="size-3" />
                          Book it
                        </Button>
                      )}
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
