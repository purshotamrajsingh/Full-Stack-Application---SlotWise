// Server-side realtime emitter — broadcasts booking events through the
// SlotWise realtime hub (mini-service on port 3003).
//
// Transport: a single long-lived socket.io-client connection from the Next.js
// server to the hub (server-to-server, direct localhost). Events are queued
// while the connection is down and flushed on reconnect, so booking mutations
// never block or fail because of the hub — realtime is strictly best-effort.

import { io, type Socket } from "socket.io-client";
import type { BookingDTO } from "@/lib/types";

const HUB_URL = process.env.REALTIME_URL ?? "http://localhost:3003";
const INTERNAL_KEY = process.env.REALTIME_INTERNAL_KEY ?? "dev-internal-key";

export type RealtimeEventType =
  | "booking:created"
  | "booking:cancelled"
  | "booking:rescheduled"
  | "booking:status"
  | "booking:updated";

export interface RealtimeMessage {
  type: RealtimeEventType;
  actorId: string;
  actorName: string;
  booking: BookingDTO;
  at: string;
}

interface QueuedEmit {
  rooms: string[];
  event: string;
  payload: RealtimeMessage | SlotsChangedMessage;
}

let socket: Socket | null = null;
let ready = false;
const queue: QueuedEmit[] = [];

function ensureSocket(): Socket {
  if (socket) return socket;
  socket = io(HUB_URL, {
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 4000,
  });
  socket.on("connect", () => {
    ready = true;
    // Flush anything buffered while the hub was unreachable.
    while (queue.length > 0) {
      const job = queue.shift()!;
      socket!.emit("internal:emit", { key: INTERNAL_KEY, ...job });
    }
  });
  socket.on("disconnect", () => {
    ready = false;
  });
  return socket;
}

/**
 * Fan a booking event out to the rooms that care about it:
 *  - role:ADMIN          → the admin dashboard live feed
 *  - user:<provider uid> → the provider's diary
 *  - user:<customer id>  → the customer's "My bookings"
 *
 * `providerUserId` is the USER id of the booking's provider (not the
 * Provider row id) — rooms are keyed by user id because that is what the
 * browser `subscribe` handshake knows.
 */
export function emitBookingEvent(
  type: RealtimeEventType,
  booking: BookingDTO,
  actor: { id: string; name: string },
  providerUserId?: string | null,
): void {
  const rooms = ["role:ADMIN", `user:${booking.customerId}`];
  if (providerUserId) rooms.push(`user:${providerUserId}`);

  const payload: RealtimeMessage = {
    type,
    actorId: actor.id,
    actorName: actor.name,
    booking,
    at: new Date().toISOString(),
  };

  try {
    const s = ensureSocket();
    if (ready) {
      s.emit("internal:emit", { key: INTERNAL_KEY, rooms, event: type, payload });
    } else {
      queue.push({ rooms, event: type, payload });
      if (queue.length > 100) queue.shift(); // bounded buffer
    }
  } catch {
    // Realtime must never break the API response.
  }
}

/** Compact, privacy-safe availability signal for open slot grids. */
export interface SlotsChangedMessage {
  providerId: string;
  /** YYYY-MM-DD of the affected day (UTC). */
  date: string;
  startAt: string;
  endAt: string;
}

/**
 * Notifies open booking dialogs watching this provider that its slot
 * availability changed (booking created / cancelled / rescheduled / moved to
 * CANCELLED). Deliberately carries NO customer identity — slot grids are
 * public, booking details are not.
 */
export function emitSlotsChanged(booking: BookingDTO): void {
  const msg: SlotsChangedMessage = {
    providerId: booking.providerId,
    date: booking.startAt.slice(0, 10),
    startAt: booking.startAt,
    endAt: booking.endAt,
  };
  const rooms = [`provider-slots:${booking.providerId}`];
  try {
    const s = ensureSocket();
    if (ready) {
      s.emit("internal:emit", { key: INTERNAL_KEY, rooms, event: "slots:changed", payload: msg });
    } else {
      queue.push({ rooms, event: "slots:changed", payload: msg });
      if (queue.length > 100) queue.shift();
    }
  } catch {
    // Best-effort only.
  }
}
