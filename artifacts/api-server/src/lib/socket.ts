import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { ObjectId, type Db } from "mongodb";
import { getDb } from "./mongodb";
import { hashToken } from "./auth";
import { logger } from "./logger";
import { registerOnlineGameHandlers } from "./onlineGame/socketHandlers";

let io: Server | null = null;

// userId -> set of live socket ids (a user can have more than one connection: phone + web preview, etc.)
const onlineUsers = new Map<string, Set<string>>();

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

async function resolveUserId(token: string): Promise<string | null> {
  try {
    const db = await getDb();
    const session = await db.collection("sessions").findOne({ tokenHash: hashToken(token) });
    if (!session || session.expiresAt < new Date()) return null;
    return String(session.userId);
  } catch (err) {
    logger.warn({ err }, "[socket] failed to resolve session token");
    return null;
  }
}

/** Tells every currently-online friend of `userId` that their friend went online/offline. */
async function broadcastPresence(db: Db, userId: string, event: "friend:online" | "friend:offline") {
  if (!io) return;
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  const friendIds: ObjectId[] = user?.friends ?? [];

  for (const friendId of friendIds) {
    const sockets = onlineUsers.get(String(friendId));
    if (!sockets) continue;
    for (const socketId of sockets) {
      io.to(socketId).emit(event, { userId });
    }
  }
}

/**
 * Basic authenticated Socket.io server: verifies the same bearer session
 * token used by the REST API on connection, and tracks online/offline
 * presence so the Friends screen can show live status. This is intentionally
 * minimal — matchmaking/rooms/game-state sync are separate follow-up work.
 */
export function createSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: "*" },
    // Mounted under /api so it still resolves through the artifact's path-based proxy.
    path: "/api/socket.io",
  });

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.["token"] as string | undefined;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }
    const userId = await resolveUserId(token);
    if (!userId) {
      next(new Error("Invalid or expired session"));
      return;
    }
    socket.data["userId"] = userId;
    next();
  });

  io.on("connection", (socket) => {
    const userId = socket.data["userId"] as string;
    const wasOffline = !onlineUsers.has(userId);
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(socket.id);

    if (wasOffline) {
      getDb()
        .then((db) => broadcastPresence(db, userId, "friend:online"))
        .catch((err) => logger.warn({ err }, "[socket] online broadcast failed"));
    }

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        onlineUsers.delete(userId);
        getDb()
          .then((db) => broadcastPresence(db, userId, "friend:offline"))
          .catch((err) => logger.warn({ err }, "[socket] offline broadcast failed"));
      }
    });

    // Online multiplayer: rooms, matchmaking, synced round logic, voice relay.
    registerOnlineGameHandlers(io!, socket);
  });

  logger.info("Socket.io server attached at /api/socket.io");
  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io server has not been initialized");
  return io;
}
