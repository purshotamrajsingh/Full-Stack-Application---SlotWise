"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Loader2,
  MessageSquareQuote,
  MessagesSquare,
  Pencil,
  Reply,
  Star,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { StarRating } from "@/components/slotwise/star-rating";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useApiQuery } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { ProviderReviewItem } from "@/lib/types";
import { fmtDateUTC } from "@/lib/format";

const REPLY_MIN = 3;
const REPLY_MAX = 500;
/** How many reviews the tab asks the API for (its hard cap). */
const PAGE_SIZE = 50;

/**
 * The provider portal's Reviews tab — every review customers left on this
 * provider's bookings, with inline post / edit / delete of the public
 * business reply.
 */
export function ProviderReviewsTab() {
  const { data, loading, error, reload } = useApiQuery<{ items: ProviderReviewItem[] }>(
    `/api/providers/me/reviews?limit=${PAGE_SIZE}`,
  );
  const items = data?.items ?? [];

  // KPI strip — computed from the fetched list (no server round-trip).
  const kpis = useMemo(() => {
    const total = items.length;
    const avg = total > 0 ? items.reduce((s, r) => s + r.rating, 0) / total : 0;
    const replies = items.filter((r) => r.reply).length;
    const repliedPct = total > 0 ? Math.round((replies / total) * 100) : 0;
    return { total, avg, replies, repliedPct };
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon={Star}
          label="Average rating"
          value={kpis.total > 0 ? kpis.avg.toFixed(1) : "—"}
          sub="across recent reviews"
        />
        <KpiCard
          icon={MessageSquareQuote}
          label="Reviews"
          value={String(kpis.total)}
          sub={`newest ${PAGE_SIZE} shown`}
        />
        <KpiCard
          icon={Reply}
          label="Replies posted"
          value={String(kpis.replies)}
          sub="responses live"
        />
        <KpiCard
          icon={BadgeCheck}
          label="Reply rate"
          value={`${kpis.repliedPct}%`}
          sub="reviews answered"
        />
      </div>

      {error ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="Could not load reviews"
          description={error}
        />
      ) : loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No reviews yet"
          description="When customers review their completed visits, you can respond right here — a quick thank-you goes a long way."
        />
      ) : (
        <div className="flex max-h-[36rem] flex-col gap-3 overflow-y-auto pr-1 scrollbar-slim">
          {items.map((r) => (
            <ReviewRow key={r.id} review={r} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  sub: string;
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
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  review,
  onChanged,
}: {
  review: ProviderReviewItem;
  onChanged: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editing = review.reply !== null;
  const tooShort = draft.trim().length < REPLY_MIN;

  function openNewReply() {
    setDraft("");
    setReplying(true);
  }

  function openEditReply() {
    setDraft(review.reply ?? "");
    setReplying(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || busy) return;
    setBusy(true);
    try {
      await apiFetch(`/api/reviews/${review.id}/reply`, {
        method: "POST",
        body: { reply: draft.trim() },
      });
      toast.success(
        editing ? "Reply updated — customers see the new version." : "Reply posted — customers can now see it.",
      );
      setReplying(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post the reply.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await apiFetch(`/api/reviews/${review.id}/reply`, { method: "DELETE" });
      toast.success("Reply removed.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the reply.");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-2.5 p-4">
        {/* Header: stars + review date */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StarRating value={review.rating} />
          <span className="text-xs text-muted-foreground">
            {fmtDateUTC(review.createdAt)}
          </span>
        </div>

        {/* Comment */}
        {review.comment ? (
          <p className="text-sm leading-relaxed">“{review.comment}”</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No comment left.</p>
        )}

        {/* Meta: customer, service, visit date */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <UserRound className="size-3" />
            {review.authorName}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <MessagesSquare className="size-3" />
            {review.serviceName}
          </span>
          <span>·</span>
          <span>visited {fmtDateUTC(review.bookingStartAt)}</span>
        </p>

        {/* Reply bubble or inline reply form */}
        {replying ? (
          <form className="mt-1 flex flex-col gap-2" onSubmit={submit}>
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter posts, Shift+Enter adds a new line.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              maxLength={REPLY_MAX}
              rows={3}
              className="min-h-20"
              aria-label="Your public reply"
              placeholder="Thank them, address the feedback, invite them back…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Enter to post · Shift+Enter for a new line
              </p>
              <span
                className={
                  draft.length > REPLY_MAX - 50
                    ? "text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums"
                    : "text-xs text-muted-foreground tabular-nums"
                }
              >
                {draft.length}/{REPLY_MAX}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setReplying(false)}
                disabled={busy}
              >
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={busy || tooShort}>
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Reply className="size-3.5" />
                )}
                {editing ? "Save reply" : "Post reply"}
              </Button>
            </div>
          </form>
        ) : review.reply ? (
          <div className="mt-1 rounded-lg border-l-2 border-primary/40 bg-muted/50 px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Reply className="size-3 text-primary" />
                Reply from {review.repliedByName ?? "you"}
                {review.repliedAt && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-normal normal-case tracking-normal">
                      {fmtDateUTC(review.repliedAt)}
                    </span>
                  </>
                )}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={openEditReply}
                  disabled={busy}
                >
                  <Pencil className="size-3" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 className="size-3" />
                  Delete
                </Button>
              </div>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-foreground/90">
              {review.reply}
            </p>
          </div>
        ) : (
          <div className="mt-1">
            <Button size="sm" variant="outline" onClick={openNewReply} disabled={busy}>
              <Reply className="size-3.5" />
              Reply
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reply?</AlertDialogTitle>
            <AlertDialogDescription>
              The reply will be removed from {review.authorName}&apos;s review
              everywhere customers see it. You can post a new one at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reply</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete reply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
