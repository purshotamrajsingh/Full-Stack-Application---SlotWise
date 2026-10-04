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
  /** Provider pre-select hint (waitlist deep-link): dialog jumps to the time picker. */
  bookingProviderId: string | null;
  /** "YYYY-MM-DD" date hint (waitlist deep-link): the picker starts on this day. */
  bookingDate: string | null;
  /** Provider whose public profile dialog is open (null = closed). */
  profileProviderId: string | null;
  /** Message to surface on the auth view (e.g. "Sign in to book"). */
  authIntent: string | null;
  nav: (view: View) => void;
  setAdminTab: (tab: AdminTab) => void;
  /** Optional deep-link hints: provider to pre-select and day to land on. */
  openBooking: (serviceId: string, opts?: { providerId?: string; date?: string }) => void;
  closeBooking: () => void;
  openReschedule: (bookingId: string) => void;
  openProfile: (providerId: string) => void;
  closeProfile: () => void;
  goAuth: (intent?: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  view: "landing",
  adminTab: "overview",
  bookingServiceId: null,
  rescheduleBookingId: null,
  bookingProviderId: null,
  bookingDate: null,
  profileProviderId: null,
  authIntent: null,

  nav: (view) => set({ view, authIntent: null }),
  setAdminTab: (adminTab) => set({ adminTab }),
  openBooking: (serviceId, opts) =>
    set({
      bookingServiceId: serviceId,
      bookingProviderId: opts?.providerId ?? null,
      bookingDate: opts?.date ?? null,
    }),
  closeBooking: () =>
    set({
      bookingServiceId: null,
      rescheduleBookingId: null,
      bookingProviderId: null,
      bookingDate: null,
    }),
  openReschedule: (bookingId) => set({ rescheduleBookingId: bookingId }),
  openProfile: (providerId) => set({ profileProviderId: providerId }),
  closeProfile: () => set({ profileProviderId: null }),
  goAuth: (intent) => set({ view: "auth", authIntent: intent ?? null }),
}));
