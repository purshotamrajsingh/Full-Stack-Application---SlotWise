"use client";

import { useState } from "react";
import {
  CalendarOff,
  CalendarPlus,
  Loader2,
  Plane,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { TimeOffDTO } from "@/lib/types";
import { addDaysKey, fmtDateUTC, minutesToTime, todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";

const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => i * 15); // 00:00–23:45 in 15-min steps

/** True when the window spans one or more whole days (00:00→00:00). */
function isFullDay(t: TimeOffDTO): boolean {
  return (
    t.startAt.slice(11) === "00:00:00.000Z" &&
    t.endAt.slice(11) === "00:00:00.000Z"
  );
}

function windowLabel(t: TimeOffDTO): string {
  if (isFullDay(t)) {
    const from = fmtDateUTC(t.startAt);
    const lastDayIso = new Date(new Date(t.endAt).getTime() - 1).toISOString();
    const multiDay = t.startAt.slice(0, 10) !== lastDayIso.slice(0, 10);
    return multiDay ? `${from} → ${fmtDateUTC(lastDayIso)}` : from;
  }
  return `${fmtDateUTC(t.startAt)} · ${t.startAt.slice(11, 16)}–${t.endAt.slice(11, 16)} (UTC)`;
}

/**
 * Provider time-off manager — holidays, sick days and partial-day blocks.
 * Lives under the Availability tab; the REST layer refuses new bookings that
 * overlap a window, and affected customers get a "schedule change" note.
 */
export function TimeOffManager() {
  const { data, loading, reload } = useApiQuery<{ items: TimeOffDTO[] }>(
    "/api/providers/me/time-off",
  );
  const [open, setOpen] = useState(false);

  const items = data?.items ?? [];
  const upcoming = items.filter((t) => new Date(t.endAt).getTime() > Date.now());
  const past = items.filter((t) => new Date(t.endAt).getTime() <= Date.now());

  return (
    <Card className="py-0">
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Plane className="size-4.5 text-primary" />
            Time off &amp; holidays
          </span>
          <Button size="sm" onClick={() => setOpen(true)}>
            <CalendarPlus className="size-4" />
            Add time off
          </Button>
        </CardTitle>
        <CardDescription>
          Blocked days stop new bookings instantly. Existing bookings inside a
          window keep their status — their customers get a heads-up note to
          rebook.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 p-4">
        {loading && items.length === 0 ? (
          <div className="flex flex-col gap-3 py-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-4">
            <EmptyState
              icon={CalendarOff}
              title="No time off scheduled"
              description="Block a holiday, a sick day or a few hours — your calendar updates everywhere in real time."
            />
          </div>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Upcoming ({upcoming.length})
            </p>
            <ul className="mt-1 flex flex-col gap-2">
              {upcoming.map((t) => (
                <TimeOffRow key={t.id} t={t} onChanged={reload} active />
              ))}
              {upcoming.length === 0 && (
                <li className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  Nothing coming up — you&apos;re wide open.
                </li>
              )}
            </ul>
            {past.length > 0 && (
              <>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recent ({past.length})
                </p>
                <ul className="mt-1 flex flex-col gap-2 opacity-70">
                  {past.map((t) => (
                    <TimeOffRow key={t.id} t={t} onChanged={reload} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </CardContent>

      <AddTimeOffDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(notified) => {
          reload();
          setOpen(false);
          toast.success("Time off added.", {
            description:
              notified > 0
                ? `${notified} customer${notified === 1 ? "" : "s"} with bookings inside the window ${notified === 1 ? "was" : "were"} notified.`
                : "No existing bookings are affected.",
          });
        }}
      />
    </Card>
  );
}

function TimeOffRow({
  t,
  onChanged,
  active,
}: {
  t: TimeOffDTO;
  onChanged: () => void;
  active?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/providers/me/time-off/${t.id}`, { method: "DELETE" });
      toast.success("Time off removed — those slots are bookable again.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={cn(
        "card-lift flex items-center gap-3 rounded-xl border p-3",
        active
          ? "border-amber-500/25 bg-amber-500/[0.06]"
          : "border-dashed bg-muted/30",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          active
            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isFullDay(t) ? <Plane className="size-4.5" /> : <CalendarOff className="size-4.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">
          {windowLabel(t)}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">
            {t.reason || (isFullDay(t) ? "Away all day" : "Partial-day block")}
          </span>
          {t.conflicts > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400">
              <TriangleAlert className="size-3" />
              {t.conflicts} booking{t.conflicts === 1 ? "" : "s"} to move
            </span>
          )}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        aria-label="Remove time off"
        disabled={busy}
        onClick={remove}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
      </Button>
    </li>
  );
}

function AddTimeOffDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (notified: number) => void;
}) {
  const [date, setDate] = useState(todayKey());
  const [endDate, setEndDate] = useState("");
  const [partial, setPartial] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch<{ notified: number }>("/api/providers/me/time-off", {
        method: "POST",
        body: {
          date,
          ...(endDate && !partial ? { endDate } : {}),
          ...(partial ? { startTime, endTime } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      onCreated(res.notified ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add time off.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plane className="size-5 text-primary" />
            Add time off
          </DialogTitle>
          <DialogDescription>
            New bookings can&apos;t overlap this window. Customers with existing
            bookings inside it are notified to rebook.
          </DialogDescription>
        </DialogHeader>

        <form className="flex flex-col gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timeoff-date">From</Label>
              <Input
                id="timeoff-date"
                type="date"
                required
                min={todayKey()}
                value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  setDate(v);
                  if (endDate && endDate < v) setEndDate("");
                }}
              />
            </div>
            {!partial && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="timeoff-end">
                  Until <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="timeoff-end"
                  type="date"
                  min={date}
                  max={addDaysKey(date, 180)}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Part of the day only</p>
              <p className="text-xs text-muted-foreground">
                e.g. a long lunch, training morning, school run
              </p>
            </div>
            {/* Simple accessible toggle — two-option segmented control */}
            <div
              className="flex rounded-lg border bg-background p-0.5"
              role="tablist"
              aria-label="Block type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!partial}
                onClick={() => setPartial(false)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  !partial
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Full day
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={partial}
                onClick={() => setPartial(true)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  partial
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Partial
              </button>
            </div>
          </div>

          {partial && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Block from</Label>
                <Select value={startTime} onValueChange={setStartTime}>
                  <SelectTrigger className="tabular-nums" aria-label="Block start">
                    {startTime}
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TIME_OPTIONS.map((m) => (
                      <SelectItem key={m} value={minutesToTime(m)} className="tabular-nums">
                        {minutesToTime(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Block until</Label>
                <Select value={endTime} onValueChange={setEndTime}>
                  <SelectTrigger className="tabular-nums" aria-label="Block end">
                    {endTime}
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {TIME_OPTIONS.map((m) => (
                      <SelectItem key={m} value={minutesToTime(m)} className="tabular-nums">
                        {minutesToTime(m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="timeoff-reason">
              Reason <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="timeoff-reason"
              placeholder="Annual leave, conference, dentist…"
              maxLength={100}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-16"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Block this time
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
