"use client";

// Browser-side realtime client — a single socket.io connection shared by all
// views. Connects through the Caddy gateway ("/?XTransformPort=3003"), then
// authenticates with the SlotWise access token so the hub can join the socket
// to the user's personal + role rooms.

import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/tokens";
import type { RealtimeMessage, SlotsChangedMessage, TimeOffChangedMessage, NotificationMessage } from "@/lib/realtime";

export type { RealtimeMessage, SlotsChangedMessage, TimeOffChangedMessage, NotificationMessage };

type Handler = (msg: RealtimeMessage) => void;
type SlotsHandler = (msg: SlotsChangedMessage) => void;
type TimeOffHandler = (msg: TimeOffChangedMessage) => void;
type NotificationHandler = (msg: NotificationMessage) => void;
type ConnectionListener = (connected: boolean) => void;

const BOOKING_EVENTS: RealtimeMessage["type"][] = [
  "booking:created",
  "booking:cancelled",
  "booking:rescheduled",
  "booking:status",
  "booking:updated",
];

let socket: Socket | null = null;
let refCount = 0;
let subscribed = false;
let watchTarget: string | null = null;

const handlers = new Set<Handler>();
const slotsHandlers = new Set<SlotsHandler>();
const timeOffHandlers = new Set<TimeOffHandler>();
const notificationHandlers = new Set<NotificationHandler>();
const connectionListeners = new Set<ConnectionListener>();

function authenticate(s: Socket) {
  const token = getAccessToken();
  if (!token) return;
  s.emit("subscribe", { accessToken: token }, (res: { ok?: boolean }) => {
    subscribed = Boolean(res?.ok);
    if (subscribed && watchTarget) {
      // Re-assert the slot-grid watch after a reconnect.
      s.emit("watch-provider", { providerId: watchTarget }, () => {});
    }
    connectionListeners.forEach((l) => l(true));
  });
}

function getSocket(): Socket {
  if (socket) return socket;

  socket = io("/?XTransformPort=3003", {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
    timeout: 8000,
  });

  socket.on("connect", () => {
    authenticate(socket!);
  });

  socket.on("disconnect", () => {
    subscribed = false;
    connectionListeners.forEach((l) => l(false));
  });

  for (const evt of BOOKING_EVENTS) {
    socket.on(evt, (msg: RealtimeMessage) => {
      handlers.forEach((h) => h(msg));
    });
  }
  socket.on("slots:changed", (msg: SlotsChangedMessage) => {
    slotsHandlers.forEach((h) => h(msg));
  });
  socket.on("timeoff:changed", (msg: TimeOffChangedMessage) => {
    timeOffHandlers.forEach((h) => h(msg));
  });
  socket.on("notification:new", (msg: NotificationMessage) => {
    notificationHandlers.forEach((h) => h(msg));
  });

  return socket;
}

/** Follow one provider's public slot-availability channel (null = stop). */
export function watchProviderSlots(providerId: string | null) {
  watchTarget = providerId;
  if (socket?.connected) {
    socket.emit("watch-provider", { providerId }, () => {});
  }
}

/** Acquire the shared connection. Returns a release function. */
export function acquireRealtime(onMessage: Handler, onConnection?: ConnectionListener) {
  const s = getSocket();
  refCount += 1;
  handlers.add(onMessage);
  if (onConnection) {
    connectionListeners.add(onConnection);
    onConnection(s.connected); // immediate state
  }
  if (s.connected && !subscribed) {
    // Covers the case where the user logged in after the socket connected.
    authenticate(s);
  }

  return () => {
    handlers.delete(onMessage);
    if (onConnection) connectionListeners.delete(onConnection);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.disconnect();
      socket = null;
      subscribed = false;
      watchTarget = null;
    }
  };
}

/** Subscribe to the privacy-safe slot-availability channel. */
export function acquireSlotsWatch(
  onSlotsChanged: SlotsHandler,
  onConnection?: ConnectionListener,
) {
  const s = getSocket();
  refCount += 1;
  slotsHandlers.add(onSlotsChanged);
  if (onConnection) {
    connectionListeners.add(onConnection);
    onConnection(s.connected);
  }
  if (s.connected && !subscribed) authenticate(s);

  return () => {
    slotsHandlers.delete(onSlotsChanged);
    if (onConnection) connectionListeners.delete(onConnection);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.disconnect();
      socket = null;
      subscribed = false;
      watchTarget = null;
    }
  };
}

/** Subscribe to the provider time-off channel (open booking dialogs). */
export function acquireTimeOffWatch(
  onTimeOffChanged: TimeOffHandler,
  onConnection?: ConnectionListener,
) {
  const s = getSocket();
  refCount += 1;
  timeOffHandlers.add(onTimeOffChanged);
  if (onConnection) {
    connectionListeners.add(onConnection);
    onConnection(s.connected);
  }
  if (s.connected && !subscribed) authenticate(s);

  return () => {
    timeOffHandlers.delete(onTimeOffChanged);
    if (onConnection) connectionListeners.delete(onConnection);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.disconnect();
      socket = null;
      subscribed = false;
      watchTarget = null;
    }
  };
}

/** Subscribe to the signed-in user's personal notification channel. */
export function acquireNotifications(
  onNotification: NotificationHandler,
  onConnection?: ConnectionListener,
) {
  const s = getSocket();
  refCount += 1;
  notificationHandlers.add(onNotification);
  if (onConnection) {
    connectionListeners.add(onConnection);
    onConnection(s.connected);
  }
  if (s.connected && !subscribed) authenticate(s);

  return () => {
    notificationHandlers.delete(onNotification);
    if (onConnection) connectionListeners.delete(onConnection);
    refCount -= 1;
    if (refCount <= 0) {
      socket?.disconnect();
      socket = null;
      subscribed = false;
      watchTarget = null;
    }
  };
}
