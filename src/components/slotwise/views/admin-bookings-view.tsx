"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/slotwise/status-badge";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useApiQuery, useDebounced } from "@/hooks/use-api-query";
import { apiFetch } from "@/lib/client-api";
import type { BookingDTO } from "@/lib/types";
import { fmtDateShortUTC, fmtMoney, fmtTimeUTC } from "@/lib/format";

const STATUS_OPTIONS = ["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export function AdminBookingsView() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const path = useMemo(() => {
    const params = new URLSearchParams({ sort: "date_desc" });
    if (debounced.trim()) params.set("q", debounced.trim());
    if (status !== "ALL") params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/bookings?${params.toString()}`;
  }, [debounced, status, from, to]);

  const { data, loading, error, reload } = useApiQuery<{ items: BookingDTO[] }>(path);
  const items = data?.items ?? [];

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

      <p className="text-sm text-muted-foreground">
        {loading ? "Loading…" : `${items.length} booking${items.length === 1 ? "" : "s"}`}
      </p>

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
                <thead>
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
                    <tr key={b.id} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                        <p>{fmtDateShortUTC(b.startAt)}</p>
                        <p className="text-xs text-muted-foreground">{fmtTimeUTC(b.startAt)}</p>
                      </td>
                      <td className="px-4 py-3">{b.serviceName}</td>
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
