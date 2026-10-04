// Client-side token persistence (localStorage) — kept standalone to avoid
// circular imports between the auth store and the API client.

const ACCESS_KEY = "slotwise.access";
const REFRESH_KEY = "slotwise.refresh";
const USER_KEY = "slotwise.user";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_KEY);
}

export function setAccessToken(token: string): void {
  window.localStorage.setItem(ACCESS_KEY, token);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setRefreshToken(token: string): void {
  window.localStorage.setItem(REFRESH_KEY, token);
}

export function getCachedUser(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(USER_KEY);
}

export function setCachedUser(json: string): void {
  window.localStorage.setItem(USER_KEY, json);
}

export function clearAuthStorage(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
  window.localStorage.removeItem(USER_KEY);
}
