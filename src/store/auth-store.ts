"use client";

import { create } from "zustand";
import { apiFetch } from "@/lib/client-api";
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
    set({ user: res.user, status: "ready" });
    return res.user;
  },

  logout: () => {
    clearAuthStorage();
    set({ user: null, status: "ready" });
  },

  bootstrap: async () => {
    if (!getRefreshToken()) {
      clearAuthStorage();
      set({ user: null, status: "ready" });
      return;
    }
    try {
      const res = await apiFetch<{ user: UserDTO }>("/api/auth/me");
      set({ user: res.user, status: "ready" });
    } catch {
      clearAuthStorage();
      set({ user: null, status: "ready" });
    }
  },
}));
