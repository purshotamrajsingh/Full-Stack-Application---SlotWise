"use client";

import {
  clearAuthStorage,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/lib/tokens";

export class ApiClientError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh: many concurrent 401s share one refresh round-trip. */
export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          clearAuthStorage();
          return false;
        }
        const data = (await res.json()) as {
          accessToken: string;
          refreshToken: string;
        };
        setAccessToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Set to false for the refresh call itself. */
  allowRefresh?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { method = "GET", body, allowRefresh = true } = options;

  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await doFetch();

  // One transparent retry after a token refresh.
  if (res.status === 401 && allowRefresh && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    }
  }

  let payload: { error?: string; code?: string } | null = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text) as { error?: string; code?: string };
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      payload?.code ?? "HTTP_ERROR",
      payload?.error ?? `Request failed (${res.status})`,
    );
  }

  return (payload ?? {}) as T;
}

/** Authenticated binary/text file download (CSV, ICS…) as a browser file. */
async function downloadFile(
  path: string,
  fallbackFilename: string,
): Promise<void> {
  const doFetch = () =>
    fetch(path, {
      headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
    });

  let res = await doFetch();
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* not JSON */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Downloads an authenticated CSV endpoint as a browser file. */
export async function downloadCsv(path: string): Promise<void> {
  await downloadFile(path, "slotwise-export.csv");
}

/** Downloads a booking's calendar invite (.ics) to the user's machine. */
export async function downloadIcs(bookingId: string): Promise<void> {
  await downloadFile(
    `/api/bookings/${bookingId}/calendar.ics`,
    "slotwise-booking.ics",
  );
}
