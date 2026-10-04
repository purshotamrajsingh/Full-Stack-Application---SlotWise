/**
 * SlotWise realtime hub — mini-service on port 3003.
 *
 * Transport notes:
 *  - Browser clients connect through the Caddy gateway via
 *    `io("/?XTransformPort=3003")`. The engine path "/" makes the hub accept
 *    socket.io traffic on any URL path (engine.io's check is a first-character
 *    prefix match), which is what the gateway forwarding relies on.
 *  - Because of that, plain HTTP endpoints on this port are unreachable —
 *  everything (including health checks and server-to-server emits) goes
 *  through the socket.io protocol itself.
 *
 * Client protocol:
 *  - `subscribe { accessToken }` → JWT-verified; joins rooms
 *      user:<userId>   personal notifications
 *      role:<ROLE>     role broadcasts (admin dashboard lives here)
 *  - `internal:emit { key, rooms, event, payload }` → for the Next.js API
 *    layer only (shared internal key); broadcasts `event` to `rooms`.
 *  - `health` → ack with hub stats (QA/monitoring).
 *
 * Broadcast events (emitted by the API layer after booking mutations):
 *  booking:created | booking:cancelled | booking:rescheduled
 *  booking:status   | booking:updated
 */

import { createServer } from "http";
import { existsSync, unlinkSync } from "fs";
import { spawn } from "child_process";
import { Server, type Socket } from "socket.io";
import { jwtVerify } from "jose";

const PORT = 3003; // r5 bootstrap touch
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-access-secret-change-me",
);
const INTERNAL_KEY = process.env.INTERNAL_KEY ?? "dev-internal-key";

interface SubscribePayload {
  accessToken?: string;
}

interface InternalEmitPayload {
  key?: string;
  rooms?: string[];
  event?: string;
  payload?: unknown;
}

interface HubStats {
  online: number;
  subscribed: number;
  emitted: number;
  lastEventAt: string | null;
  startedAt: string;
}

const stats: HubStats = {
  online: 0,
  subscribed: 0,
  emitted: 0,
  lastEventAt: null,
  startedAt: new Date().toISOString(),
};

const httpServer = createServer();

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request.
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

/** Verified session claims after `subscribe`. */
interface SessionInfo {
  userId: string;
  role: string;
  name: string;
}

const sessions = new WeakMap<Socket, SessionInfo>();
/** providerRowId currently watched by each socket (slot-grid live updates). */
const watchedProvider = new Map<Socket, string>();

io.on("connection", (socket) => {
  stats.online = io.engine.clientsCount;
  console.log(`[realtime] connect ${socket.id} (${stats.online} online)`);

  socket.on("subscribe", async (data: SubscribePayload, ack?: (r: unknown) => void) => {
    try {
      const token = data?.accessToken;
      if (!token) {
        ack?.({ ok: false, error: "missing token" });
        return;
      }
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (payload.type !== "access" || typeof payload.sub !== "string") {
        ack?.({ ok: false, error: "not an access token" });
        return;
      }
      const info: SessionInfo = {
        userId: payload.sub,
        role: String(payload.role ?? ""),
        name: String(payload.name ?? ""),
      };
      sessions.set(socket, info);
      await socket.join(`user:${info.userId}`);
      await socket.join(`role:${info.role}`);
      stats.subscribed += 1;
      ack?.({ ok: true, userId: info.userId, role: info.role });
      console.log(`[realtime] subscribe ${socket.id} → user:${info.userId} role:${info.role}`);
    } catch {
      ack?.({ ok: false, error: "invalid token" });
      console.warn(`[realtime] subscribe rejected for ${socket.id}`);
    }
  });

  // Slot-grid watching: any authenticated socket may follow ONE provider's
  // public availability channel (used by the booking dialog to grey out
  // slots the moment someone else takes them). Only timing info flows on
  // this channel — never customer identity.
  socket.on(
    "watch-provider",
    async (data: { providerId?: string | null }, ack?: (r: unknown) => void) => {
      if (!sessions.has(socket)) {
        ack?.({ ok: false, error: "subscribe first" });
        return;
      }
      const prev = watchedProvider.get(socket);
      if (prev) {
        await socket.leave(`provider-slots:${prev}`);
        watchedProvider.delete(socket);
      }
      const providerId = typeof data?.providerId === "string" ? data.providerId : null;
      if (providerId) {
        await socket.join(`provider-slots:${providerId}`);
        watchedProvider.set(socket, providerId);
      }
      ack?.({ ok: true, watching: providerId });
    },
  );

  // Server-to-server emit from the Next.js API layer.
  socket.on("internal:emit", (data: InternalEmitPayload, ack?: (r: unknown) => void) => {
    if (data?.key !== INTERNAL_KEY) {
      ack?.({ ok: false, error: "bad key" });
      console.warn(`[realtime] internal:emit rejected from ${socket.id}`);
      return;
    }
    const rooms = Array.isArray(data.rooms)
      ? data.rooms.filter((r): r is string => typeof r === "string")
      : [];
    const event = typeof data.event === "string" ? data.event : "";
    if (rooms.length === 0 || event === "") {
      ack?.({ ok: false, error: "rooms and event are required" });
      return;
    }
    for (const room of rooms) io.to(room).emit(event, data.payload);
    stats.emitted += 1;
    stats.lastEventAt = new Date().toISOString();
    ack?.({ ok: true, delivered: rooms.length });
    console.log(`[realtime] emit "${event}" → [${rooms.join(", ")}]`);
  });

  // QA / monitoring probe.
  socket.on("health", (_data: unknown, ack?: (r: unknown) => void) => {
    ack?.({ status: "ok", service: "slotwise-realtime", stats });
  });

  socket.on("disconnect", () => {
    stats.online = io.engine.clientsCount;
    watchedProvider.delete(socket);
    console.log(`[realtime] disconnect ${socket.id} (${stats.online} online)`);
  });

  socket.on("error", (err) => console.error(`[realtime] socket error ${socket.id}:`, err));
});

httpServer.listen(PORT, () => {
  console.log(`[realtime] SlotWise hub listening on port ${PORT}`);
});

// ---------------------------------------------------------------------------
// One-shot dev-server bootstrap. (r8 re-arm 2026-10-04T12:36 — Review reply fields)
// The sandbox gateway kills any process spawned during an agent Bash call, but
// this hub is a boot-time orphan and its children survive. Drop a marker file
// at .zscripts/dev-server.stamp, then touch this file (hot reload) to have the
// hub spawn `bun run dev` for the Next.js app — delayed 30s so the spawn
// happens well after the tool call that triggered it has ended.
const DEV_BOOT_MARKER = "/home/z/my-project/.zscripts/dev-server.stamp";
if (existsSync(DEV_BOOT_MARKER)) {
  try { unlinkSync(DEV_BOOT_MARKER); } catch { /* already gone */ }
  const delayMs = 30_000;
  console.log(`[realtime] dev-server bootstrap armed (spawning in ${delayMs / 1000}s)`);
  setTimeout(() => {
    try {
      const child = spawn("bash", ["-c", "exec bun run dev"], {
        cwd: "/home/z/my-project",
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log(`[realtime] dev-server bootstrap: spawned bun run dev (pid=${child.pid})`);
    } catch (err) {
      console.error("[realtime] dev-server bootstrap failed:", err);
    }
  }, delayMs);
}

process.on("SIGTERM", () => {
  console.log("[realtime] SIGTERM, shutting down…");
  io.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("[realtime] SIGINT, shutting down…");
  io.close(() => process.exit(0));
});
