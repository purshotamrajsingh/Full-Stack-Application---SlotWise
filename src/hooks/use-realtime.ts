"use client";

import { useEffect, useRef, useState } from "react";
import {
  acquireRealtime,
  acquireSlotsWatch,
  acquireNotifications,
  acquireTimeOffWatch,
  watchProviderSlots,
  type RealtimeMessage,
  type SlotsChangedMessage,
  type NotificationMessage,
  type TimeOffChangedMessage,
} from "@/lib/realtime-client";
import { useAuthStore } from "@/store/auth-store";

/**
 * Subscribes the current view to live booking events.
 *
 * - Re-subscribes automatically when the signed-in user changes (the hub
 *   room membership is derived from the access token).
 * - `onMessage` is kept in a ref (synced in an effect), so callbacks can
 *   capture fresh state without tearing the socket connection down.
 * - Returns whether the realtime connection is live (for the pulse pill).
 */
export function useRealtime(onMessage: (msg: RealtimeMessage) => void, enabled = true) {
  const user = useAuthStore((s) => s.user);
  const handlerRef = useRef(onMessage);
  useEffect(() => {
    handlerRef.current = onMessage;
  }, [onMessage]);
  const userId = user?.id ?? null;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;

    const release = acquireRealtime(
      (msg) => handlerRef.current(msg),
      (state) => setConnected(state),
    );
    return release;
  }, [enabled, userId]);

  return { connected };
}

/**
 * Follows one provider's public slot-availability channel while a slot grid
 * is visible. `onChanged` may read the latest selected slot from state —
 * it is kept in a ref, so the subscription itself is stable across
 * re-renders (no socket churn on every click).
 */
export function useSlotsWatch(
  providerId: string | null,
  date: string | null,
  onChanged: (msg: SlotsChangedMessage) => void,
) {
  const handlerRef = useRef(onChanged);
  useEffect(() => {
    handlerRef.current = onChanged;
  }, [onChanged]);

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!providerId || !date) return;
    watchProviderSlots(providerId);
    const release = acquireSlotsWatch(
      (msg) => handlerRef.current(msg),
      (state) => setConnected(state),
    );
    return () => {
      release();
      watchProviderSlots(null);
    };
  }, [providerId, date]);

  return { connected };
}

/**
 * Follows the signed-in user's personal notification channel (the bell).
 * New notifications bump the unread counter and can fire a toast.
 */
export function useNotifications(
  onNotification: (msg: NotificationMessage) => void,
  enabled = true,
) {
  const user = useAuthStore((s) => s.user);
  const handlerRef = useRef(onNotification);
  useEffect(() => {
    handlerRef.current = onNotification;
  }, [onNotification]);
  const userId = user?.id ?? null;

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !userId) return;

    const release = acquireNotifications(
      (msg) => handlerRef.current(msg),
      (state) => setConnected(state),
    );
    return release;
  }, [enabled, userId]);

  return { connected };
}

/**
 * Follows the provider's time-off channel while a slot grid is open (the hub
 * broadcasts window changes to the same public room as slot changes).
 */
export function useTimeOffWatch(
  providerId: string | null,
  onTimeOffChanged: (msg: TimeOffChangedMessage) => void,
) {
  const handlerRef = useRef(onTimeOffChanged);
  useEffect(() => {
    handlerRef.current = onTimeOffChanged;
  }, [onTimeOffChanged]);

  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    watchProviderSlots(providerId);
    const release = acquireTimeOffWatch(
      (msg) => handlerRef.current(msg),
      (state) => setConnected(state),
    );
    return () => {
      release();
      watchProviderSlots(null);
    };
  }, [providerId]);

  return { connected };
}
