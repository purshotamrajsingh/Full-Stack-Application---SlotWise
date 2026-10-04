"use client";

import { useState } from "react";
import { Loader2, MessageSquareHeart } from "lucide-react";
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
  onClose: () => void;
  onReviewed: () => void;
}

export function ReviewDialog({ booking, onClose, onReviewed }: ReviewDialogProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!booking || rating === 0) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/bookings/${booking.id}/review`, {
        method: "POST",
        body: { rating, comment: comment.trim() || undefined },
      });
      toast.success("Thanks for the review!");
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
            <MessageSquareHeart className="size-5 text-primary" />
            How was your appointment?
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
            Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
