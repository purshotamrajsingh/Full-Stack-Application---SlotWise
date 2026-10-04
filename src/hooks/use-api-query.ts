"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";

export interface QueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

interface ResultState<T> {
  key: string | null;
  data: T | null;
  error: string | null;
}

/**
 * Small data-fetching hook with manual reload.
 * Keep `path` stable (e.g. via useMemo) — it is the only dependency.
 *
 * `loading` is derived (not stored): the spinner shows only while the very
 * first fetch for the current request is in flight and no data/error exists
 * yet. Reloads and filter changes keep the previous data visible (SWR-style).
 */
export function useApiQuery<T>(path: string | null): QueryResult<T> {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<ResultState<T>>({
    key: null,
    data: null,
    error: null,
  });

  const requestKey = path === null ? null : `${path}#${tick}`;

  useEffect(() => {
    if (path === null || requestKey === null) return;
    let cancelled = false;
    apiFetch<T>(path).then(
      (res) => {
        if (cancelled) return;
        setResult({ key: requestKey, data: res, error: null });
      },
      (err: Error) => {
        if (cancelled) return;
        setResult({
          key: requestKey,
          data: null,
          error: err.message || "Failed to load data.",
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, requestKey]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const loading =
    requestKey !== null &&
    result.key !== requestKey &&
    result.data === null &&
    result.error === null;

  return { data: result.data, loading, error: result.error, reload };
}

/** Debounce helper for search inputs. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
