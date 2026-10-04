"use client";

import { useMemo, useState } from "react";
import { CalendarX2, Heart, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceCard } from "@/components/slotwise/service-card";
import { EmptyState } from "@/components/slotwise/empty-state";
import { useUIStore } from "@/store/ui-store";
import { useAuthStore } from "@/store/auth-store";
import { useApiQuery, useDebounced } from "@/hooks/use-api-query";
import type { ServiceDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRICE_OPTIONS = [
  { value: "all", label: "Any price" },
  { value: "0-40", label: "Under £40" },
  { value: "40-70", label: "£40 – £70" },
  { value: "70-10000", label: "£70+" },
];

const SORT_OPTIONS = [
  { value: "popular", label: "Most booked" },
  { value: "rating", label: "Best rated" },
  { value: "price_asc", label: "Price: low → high" },
  { value: "price_desc", label: "Price: high → low" },
  { value: "next_available", label: "Next available" },
  { value: "duration", label: "Shortest first" },
  { value: "name", label: "Name (A–Z)" },
];

interface ProvidersResponse {
  items: { id: string; name: string; specialty: string }[];
}

export function BrowseView() {
  const openBooking = useUIStore((s) => s.openBooking);
  const user = useAuthStore((s) => s.user);
  const isCustomer = user?.role === "CUSTOMER";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [category, setCategory] = useState("all");
  const [price, setPrice] = useState("all");
  const [provider, setProvider] = useState("all");
  const [sort, setSort] = useState("popular");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  // Optimistic heart toggles applied on top of the server's isFavorite
  // flags (keyed by serviceId) — see favoriteIds below.
  const [favOverrides, setFavOverrides] = useState<Record<string, boolean>>({});

  const [minPrice, maxPrice] = useMemo(() => {
    if (price === "all") return ["", ""];
    const [min, max] = price.split("-");
    return [min, max === "10000" ? "" : max];
  }, [price]);

  const servicesPath = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (category !== "all") params.set("category", category);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (provider !== "all") params.set("provider", provider);
    params.set("sort", sort);
    return `/api/services?${params.toString()}`;
  }, [debouncedSearch, category, minPrice, maxPrice, provider, sort]);

  const { data: categoriesData } = useApiQuery<{ items: { name: string; count: number }[] }>(
    "/api/categories",
  );
  const { data: providersData } = useApiQuery<ProvidersResponse>("/api/providers");
  const { data, loading, error } = useApiQuery<{ items: ServiceDTO[]; total: number }>(
    servicesPath,
  );

  const items = data?.items ?? [];

  // The customer's hearted services: seeded from the fetched isFavorite
  // flags, then kept live by card toggles without a refetch. Locally
  // toggled hearts survive even when a filter hides their card.
  const favoriteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of items) {
      const fav = s.id in favOverrides ? favOverrides[s.id]! : (s.isFavorite ?? false);
      if (fav) ids.add(s.id);
    }
    for (const [id, fav] of Object.entries(favOverrides)) {
      if (fav) ids.add(id);
      else ids.delete(id);
    }
    return ids;
  }, [items, favOverrides]);

  function handleFavoriteChange(serviceId: string, isFavorite: boolean) {
    setFavOverrides((prev) => ({ ...prev, [serviceId]: isFavorite }));
  }

  // The favorites filter is applied after the category/search filters —
  // while the chip is on, only hearted services make it to the grid.
  const visibleItems = favoritesOnly
    ? items.filter((s) => favoriteIds.has(s.id))
    : items;
  const hasFilters =
    debouncedSearch.trim() !== "" ||
    category !== "all" ||
    price !== "all" ||
    provider !== "all" ||
    sort !== "popular" ||
    favoritesOnly;

  function reset() {
    setSearch("");
    setCategory("all");
    setPrice("all");
    setProvider("all");
    setSort("popular");
    setFavoritesOnly(false);
  }

  return (
    <div className="view-enter mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find your slot</h1>
        <p className="mt-1 text-muted-foreground">
          Search by service, provider or category — filters apply instantly.
        </p>
      </div>

      {/* Filter toolbar */}
      <div className="sticky top-16 z-30 -mx-4 mb-6 border-b bg-background/85 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search “massage”, “Priya”, “tutoring”…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10"
              aria-label="Search services"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Category chips */}
            <div className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              <CategoryChip
                label="All"
                active={category === "all"}
                onClick={() => setCategory("all")}
              />
              {(categoriesData?.items ?? []).map((c) => (
                <CategoryChip
                  key={c.name}
                  label={`${c.name} (${c.count})`}
                  active={category === c.name}
                  onClick={() => setCategory(c.name)}
                />
              ))}
              {isCustomer && favoriteIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((v) => !v)}
                  aria-pressed={favoritesOnly}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    favoritesOnly
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : "bg-card text-muted-foreground hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-300",
                  )}
                >
                  <Heart
                    className={cn("size-3", favoritesOnly && "fill-rose-500 text-rose-500")}
                  />
                  Favorites ({favoriteIds.size})
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 items-center gap-2 sm:grid-cols-4">
            <Select value={price} onValueChange={setPrice}>
              <SelectTrigger aria-label="Filter by price" className="w-full">
                <SlidersHorizontal className="size-3.5 shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger aria-label="Filter by provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any provider</SelectItem>
                {(providersData?.items ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger aria-label="Sort results" className="col-span-2 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Result count */}
      <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading
            ? "Searching…"
            : favoritesOnly
              ? `${visibleItems.length} favorite${visibleItems.length === 1 ? "" : "s"}`
              : `${data?.total ?? 0} service${data?.total === 1 ? "" : "s"} found`}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
          >
            <RotateCcw className="size-3.5" /> Reset filters
          </button>
        )}
      </div>

      {/* Results */}
      {error ? (
        <EmptyState
          icon={CalendarX2}
          title="Could not load services"
          description={error}
          actionLabel="Retry"
          onAction={() => window.location.reload()}
        />
      ) : loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : visibleItems.length === 0 ? (
        favoritesOnly ? (
          <EmptyState
            icon={Heart}
            title="No favorites match the current filters"
            description="Your hearted services don't fit the active search, category or price filter — reset them to see the full shortlist."
            actionLabel="Reset filters"
            onAction={reset}
          />
        ) : (
          <EmptyState
            icon={CalendarX2}
            title="No services match those filters"
            description="Try widening the price range, clearing the search, or picking another category."
            actionLabel="Reset filters"
            onAction={reset}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleItems.map((s) => (
            <ServiceCard
              key={s.id}
              // Patch the heart flag with the latest toggle so remounts
              // (e.g. re-entering the filtered grid) seed correctly.
              service={
                s.id in favOverrides ? { ...s, isFavorite: favOverrides[s.id]! } : s
              }
              onBook={openBooking}
              onFavoriteChange={handleFavoriteChange}
              className="h-full"
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-card text-muted-foreground hover:border-primary/40 hover:bg-secondary/60",
      )}
    >
      {label}
    </button>
  );
}
