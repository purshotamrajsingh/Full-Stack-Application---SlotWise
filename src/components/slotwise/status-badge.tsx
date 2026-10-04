"use client";

import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/format";

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
