"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  ListFilter,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/slotwise/status-badge";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useApiQuery, useDebounced } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { BookingDTO } from "@/lib/types";
import { fmtDateShortUTC, fmtMoney, fmtTimeUTC } from "@/lib/format";

const STATUS_OPTIONS = ["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];
const PAGE_SIZES = [10, 25, 50, 100];

interface PagedBookings {
  items: BookingDTO[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

/** 1 … 4 ⟨5⟩ 6 … 94 — compact window around the current page. */
function pageWindow(current: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, pageCount, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

export function AdminBookingsView() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const path = useMemo(() => {
    const params = new URLSearchParams({
      sort: "date_desc",
      page: String(page),
      pageSize: String(pageSize),
    });
    if (debounced.trim()) params.set("q", debounced.trim());
    if (status !== "ALL") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/bookings?${params.toString()}`;
  }, [debounced, status, from, to, page, pageSize]);

  // Any filter change sends the user back to the first page.
  useEffect(() => {
    setPage(1);
  }, [debounced, status, from, to, pageSize]);

  const { data, loading, error, reload } = useApiQuery<PagedBookings>(path);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  // NOTE: no client-side "clamp" effect — with SWR-style caching, `data` can
  // briefly hold the PREVIOUS page's response while the next one is in
  // flight, and a clamp effect would mistake that for a server-side reset.
  // Instead every handler bases its jump on `data.page` (the server already
  // clamps out-of-range pages and reports the effective page back).

  async function overrideStatus(booking: BookingDTO, next: string) {
    setBusyId(booking.id);
    try {
      await apiFetch(`/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        body: { status: next },
      });
      toast.success("Status updated.");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  const canTransition = (b: BookingDTO) =>
    b.status === "PENDING" || b.status === "CONFIRMED";

  const firstShown = total === 0 ? 0 : (data?.page ?? 1) * pageSize - pageSize + 1;
  const lastShown = Math.min((data?.page ?? 1) * pageSize, total);

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search service, customer or provider…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            aria-label="Search bookings"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            {status === "ALL" ? "All statuses" : status.replace("_", " ")}
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ALL" ? "All statuses" : s.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          aria-label="From date"
          className="w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          aria-label="To date"
          className="w-40"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {loading
            ? "Loading…"
            : total === 0
              ? "No bookings match"
              : `Showing ${firstShown}–${lastShown} of ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <ListFilter className="size-3.5 text-muted-foreground" aria-hidden />
          <Select
            value={String(pageSize)}
            onValueChange={(v) => setPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[5.5rem] text-xs" aria-label="Rows per page">
              {pageSize} / page
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)} className="text-xs">
                  {s} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <EmptyState icon={Search} title="Could not load bookings" description={error} />
      ) : loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No bookings match"
          description="Adjust the filters and try again."
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Service</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Provider</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Customer</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr
                      key={b.id}
                      className="group border-b transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        <p>{fmtDateShortUTC(b.startAt)}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtTimeUTC(b.startAt)}–{fmtTimeUTC(b.endAt)}
                        </p>
                      </td>
                      <td className="max-w-56 truncate px-4 py-3 font-medium">
                        {b.serviceName}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {b.providerName}
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {b.customerName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                        {fmtMoney(b.price)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        {busyId === b.id ? (
                          <span className="text-xs text-muted-foreground">saving…</span>
                        ) : canTransition(b) ? (
                          <Select
                            value={b.status}
                            onValueChange={(v) => overrideStatus(b, v)}
                          >
                            <SelectTrigger
                              className="h-8 w-32 text-xs"
                              aria-label={`Change status of ${b.serviceName}`}
                            >
                              {b.status.replace("_", " ")}
                            </SelectTrigger>
                            <SelectContent>
                              {(b.status === "PENDING"
                                ? ["CONFIRMED", "CANCELLED"]
                                : ["COMPLETED", "NO_SHOW", "CANCELLED"]
                              ).map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">
                                  {s.replace("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer pagination */}
            {pageCount > 1 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
                <p className="order-2 text-xs text-muted-foreground sm:order-1">
                  Page {data?.page} of {pageCount}
                </p>
                <Pagination className="order-1 justify-center sm:order-2 sm:justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label="Previous page"
                        disabled={(data?.page ?? 1) <= 1}
                        onClick={() => setPage(Math.max(1, (data?.page ?? 1) - 1))}
                      >
                        <ChevronLeft className="size-4" />
                      </Button>
                    </PaginationItem>
                    {pageWindow(data?.page ?? 1, pageCount).map((p, i) =>
                      p === "…" ? (
                        <PaginationItem key={`e${i}`}>
                          <span className="flex size-8 items-center justify-center text-muted-foreground">
                            <Ellipsis className="size-3.5" />
                          </span>
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={p}>
                          <Button
                            variant="outline"
                            size="icon"
                            className={cn(
                              "size-8 tabular-nums",
                              p === (data?.page ?? 1) &&
                                "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
                            )}
                            aria-label={`Page ${p}`}
                            aria-current={p === (data?.page ?? 1) ? "page" : undefined}
                            onClick={() => setPage(p)}
                          >
                            {p}
                          </Button>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-8"
                        aria-label="Next page"
                        disabled={(data?.page ?? 1) >= pageCount}
                        onClick={() => setPage((data?.page ?? 1) + 1)}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Status transitions are enforced: pending → confirmed/cancelled, confirmed →
          completed/no-show/cancelled.
        </p>
      )}
    </div>
  );
}
