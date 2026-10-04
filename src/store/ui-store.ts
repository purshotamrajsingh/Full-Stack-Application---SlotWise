"use client";

import { create } from "zustand";

export type View =
  | "landing"
  | "browse"
  | "auth"
  | "bookings"
  | "provider"
  | "admin";

export type AdminTab = "overview" | "services" | "staff" | "bookings";

interface UIState {
  view: View;
  adminTab: AdminTab;
  /** Service selected in the 3-click booking dialog (null = closed). */
  bookingServiceId: string | null;
  /** When set, the dialog runs in reschedule mode for this booking. */
  rescheduleBookingId: string | null;
  /** Message to surface on the auth view (e.g. "Sign in to book"). */
  authIntent: string | null;
  nav: (view: View) => void;
  setAdminTab: (tab: AdminTab) => void;
  openBooking: (serviceId: string) => void;
  closeBooking: () => void;
  openReschedule: (bookingId: string) => void;
  goAuth: (intent?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "landing",
  adminTab: "overview",
  bookingServiceId: null,
  rescheduleBookingId: null,
  authIntent: null,

  nav: (view) => set({ view, authIntent: null }),
  setAdminTab: (adminTab) => set({ adminTab }),
  openBooking: (serviceId) => set({ bookingServiceId: serviceId }),
  closeBooking: () => set({ bookingServiceId: null, rescheduleBookingId: null }),
  openReschedule: (bookingId) => set({ rescheduleBookingId: bookingId }),
  goAuth: (intent) => set({ view: "auth", authIntent: intent ?? null }),
}));
