"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  count?: number;
  size?: "sm" | "md";
  className?: string;
}

/** Read-only star display with optional review count. */
export function StarRating({ value, count, size = "sm", className }: StarRatingProps) {
  const starSize = size === "sm" ? "size-3.5" : "size-5";
  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`Rated ${value} out of 5`}
    >
      <span className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              starSize,
              i <= Math.round(value)
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground/40",
            )}
          />
        ))}
      </span>
      <span className="text-sm font-medium tabular-nums">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">({count})</span>
      )}
    </span>
  );
}

interface StarPickerProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

/** Interactive 1–5 star picker used in the review dialog. */
export function StarPicker({ value, onChange, className }: StarPickerProps) {
  const [hover, setHover] = React.useState(0);
  const shown = hover || value;
  return (
    <div className={cn("flex items-center gap-1", className)} role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-ring"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          <Star
            className={cn(
              "size-6",
              i <= shown
                ? "fill-amber-400 text-amber-400"
                : "fill-muted text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}
