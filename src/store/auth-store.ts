"use client";

import { create } from "zustand";
import { apiFetch } from "@/lib/client-api";
import { setDisplayTimezone } from "@/lib/format";
import {
  clearAuthStorage,
  getRefreshToken,
  setAccessToken,
  setCachedUser,
  setRefreshToken,
} from "@/lib/tokens";
import type { AuthResponse, UserDTO } from "@/lib/types";

interface AuthState {
  user: UserDTO | null;
  status: "loading" | "ready";
  login: (email: string, password: string) => Promise<UserDTO>;
  register: (name: string, email: string, password: string) => Promise<UserDTO>;
  logout: () => void;
  bootstrap: () => Promise<void>;
  /** Update the signed-in customer's display timezone (profile + all views). */
  updateTimezone: (timezone: string) => Promise<UserDTO>;
}

function applyUser(user: UserDTO | null) {
  // Customers may carry a display timezone; staff views stay business-UTC.
  setDisplayTimezone(user?.role === "CUSTOMER" ? user.timezone : "UTC");
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "loading",

  login: async (email, password) => {
    const res = await apiFetch<AuthResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setCachedUser(JSON.stringify(res.user));
    applyUser(res.user);
    set({ user: res.user, status: "ready" });
    return res.user;
  },

  register: async (name, email, password) => {
    const res = await apiFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    setAccessToken(res.accessToken);
    setRefreshToken(res.refreshToken);
    setCachedUser(JSON.stringify(res.user));
    applyUser(res.user);
    set({ user: res.user, status: "ready" });
    return res.user;
  },

  logout: () => {
    clearAuthStorage();
    applyUser(null);
    set({ user: null, status: "ready" });
  },

  bootstrap: async () => {
    if (!getRefreshToken()) {
      clearAuthStorage();
      applyUser(null);
      set({ user: null, status: "ready" });
      return;
    }
    try {
      const res = await apiFetch<{ user: UserDTO }>("/api/auth/me");
      applyUser(res.user);
      set({ user: res.user, status: "ready" });
    } catch {
      clearAuthStorage();
      applyUser(null);
      set({ user: null, status: "ready" });
    }
  },

  updateTimezone: async (timezone) => {
    const res = await apiFetch<{ user: UserDTO }>("/api/auth/me", {
      method: "PATCH",
      body: { timezone },
    });
    setCachedUser(JSON.stringify(res.user));
    applyUser(res.user);
    set({ user: res.user });
    return res.user;
  },
}));
