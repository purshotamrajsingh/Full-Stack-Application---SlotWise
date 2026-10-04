"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareHeart, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StarPicker } from "@/components/slotwise/star-rating";
import { apiFetch } from "@/lib/client-api";
import type { BookingDTO } from "@/lib/types";

interface ReviewDialogProps {
  booking: BookingDTO | null;
  /** "create" writes a new review; "edit" PUTs the existing one. */
  mode?: "create" | "edit";
  onClose: () => void;
  onReviewed: () => void;
}

export function ReviewDialog({ booking, mode = "create", onClose, onReviewed }: ReviewDialogProps) {
  const editing = mode === "edit";
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Seed the form when opening (edit mode starts from the existing review).
  useEffect(() => {
    if (booking && editing && booking.review) {
      setRating(booking.review.rating);
      setComment(booking.review.comment ?? "");
    }
  }, [booking, editing]);

  async function submit() {
    if (!booking || rating === 0) return;
    setSubmitting(true);
    try {
      if (editing) {
        await apiFetch(`/api/reviews/${booking.review!.id}`, {
          method: "PUT",
          body: { rating, comment: comment.trim() || null },
        });
        toast.success("Review updated.");
      } else {
        await apiFetch(`/api/bookings/${booking.id}/review`, {
          method: "POST",
          body: { rating, comment: comment.trim() || undefined },
        });
        toast.success("Thanks for the review!");
      }
      onReviewed();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={booking !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {editing ? (
              <PencilLine className="size-5 text-primary" />
            ) : (
              <MessageSquareHeart className="size-5 text-primary" />
            )}
            {editing ? "Edit your review" : "How was your appointment?"}
          </DialogTitle>
          <DialogDescription>
            {booking?.serviceName} with {booking?.providerName} —{" "}
            {booking ? new Date(booking.startAt).toDateString() : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col items-center gap-2">
            <StarPicker value={rating} onChange={setRating} />
            <span className="text-xs text-muted-foreground">
              {rating === 0 ? "Tap the stars to rate" : `${rating} / 5`}
            </span>
          </div>
          <Textarea
            placeholder="Share what worked (or what didn't)…"
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={rating === 0 || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {editing ? "Save changes" : "Submit review"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
