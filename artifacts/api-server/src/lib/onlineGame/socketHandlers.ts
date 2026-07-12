import type { Server, Socket } from "socket.io";
import { getDb } from "../mongodb";
import { logger } from "../logger";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  getRoom,
  getRoomForUser,
  serializeRoom,
  RoomError,
} from "./rooms";
import { enqueue, dequeue } from "./matchmaking";
import { startGame, handleSubmitAnswer, handleBuzz, handleSkip, placeBid, buildStateSnapshot } from "./engine";
import type { Difficulty, Room } from "./types";

const DISCONNECT_GRACE_MS = 60_000;
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function isDifficulty(v: unknown): v is Difficulty {
  return v === "easy" || v === "medium" || v === "hard";
}

async function fetchProfile(userId: string): Promise<{ username: string; avatar: string } | null> {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  return { username: user["username"] as string, avatar: user["avatar"] as string };
}

function broadcastRoomUpdate(io: Server, room: Room) {
  io.to(room.code).emit("room:update", { room: serializeRoom(room) });
}

export function registerOnlineGameHandlers(io: Server, socket: Socket) {
  const userId = socket.data["userId"] as string;

  socket.on("room:create", async (payload: { difficulty?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const difficulty = isDifficulty(payload?.difficulty) ? payload.difficulty : "medium";
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const existingRoom = getRoomForUser(userId);
      if (existingRoom) leaveRoom(userId);

      const room = createRoom({
        mode: "group",
        difficulty,
        hostUserId: userId,
        hostUsername: profile.username,
        hostAvatar: profile.avatar,
        hostSocketId: socket.id,
      });
      socket.join(room.code);
      ack?.({ ok: true, room: serializeRoom(room) });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل إنشاء الغرفة" });
    }
  });

  socket.on("room:join", async (payload: { code?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const code = String(payload?.code ?? "").toUpperCase().trim();
      if (!code) throw new RoomError("الرجاء إدخال رمز الغرفة");
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const room = joinRoom(code, userId, profile.username, profile.avatar, socket.id);
      socket.join(room.code);
      cancelDisconnectGrace(userId);
      broadcastRoomUpdate(io, room);

      if (room.status === "playing") {
        socket.emit("game:state", buildStateSnapshot(room));
      }
      ack?.({ ok: true, room: serializeRoom(room) });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل الانضمام إلى الغرفة" });
    }
  });

  socket.on("room:leave", () => {
    const room = getRoomForUser(userId);
    dequeue(userId);
    const updated = leaveRoom(userId);
    socket.leave(room?.code ?? "");
    if (updated) broadcastRoomUpdate(io, updated);
  });

  socket.on("room:start", async (_payload: unknown, ack?: (res: unknown) => void) => {
    try {
      const room = getRoomForUser(userId);
      if (!room) throw new RoomError("لست في غرفة");
      const player = room.players.find((p) => p.userId === userId);
      if (!player?.isHost) throw new RoomError("فقط المضيف يمكنه بدء اللعبة");
      if (room.players.length < 2) throw new RoomError("يجب أن يكون هناك لاعبان على الأقل");
      const db = await getDb();
      await startGame(io, db, room);
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل بدء اللعبة" });
    }
  });

  socket.on("matchmaking:join", async (payload: { difficulty?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const difficulty = isDifficulty(payload?.difficulty) ? payload.difficulty : "medium";
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const opponent = enqueue({ userId, username: profile.username, avatar: profile.avatar, socketId: socket.id, difficulty, queuedAt: Date.now() });
      if (!opponent) {
        ack?.({ ok: true, matched: false });
        return;
      }

      const room = createRoom({
        mode: "quick",
        difficulty,
        hostUserId: opponent.userId,
        hostUsername: opponent.username,
        hostAvatar: opponent.avatar,
        hostSocketId: opponent.socketId,
      });
      const joined = joinRoom(room.code, userId, profile.username, profile.avatar, socket.id);
      socket.join(room.code);
      io.sockets.sockets.get(opponent.socketId)?.join(room.code);

      io.to(room.code).emit("room:matched", { room: serializeRoom(joined) });
      ack?.({ ok: true, matched: true, room: serializeRoom(joined) });

      const db = await getDb();
      setTimeout(() => startGame(io, db, joined).catch((err) => logger.error({ err }, "[onlineGame] quick match start failed")), 1200);
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل البحث عن مباراة" });
    }
  });

  socket.on("matchmaking:cancel", () => dequeue(userId));

  socket.on("game:buzz", () => {
    const room = getRoomForUser(userId);
    if (room) handleBuzz(io, room, userId);
  });

  socket.on("game:submitAnswer", (payload: { text?: unknown }) => {
    const room = getRoomForUser(userId);
    if (!room) return;
    const text = typeof payload?.text === "string" ? payload.text : "";
    handleSubmitAnswer(io, room, userId, text);
  });

  socket.on("game:skip", () => {
    const room = getRoomForUser(userId);
    if (room) handleSkip(io, room, userId);
  });

  socket.on("game:bid", (payload: { amount?: unknown }) => {
    const room = getRoomForUser(userId);
    if (!room) return;
    const amount = Number(payload?.amount);
    placeBid(room, io, userId, amount);
  });

  // Push-to-talk voice relay: binary audio clip forwarded to everyone else in the room.
  socket.on("voice:clip", (payload: { data?: unknown; mimeType?: unknown }) => {
    const room = getRoomForUser(userId);
    if (!room || !payload?.data) return;
    socket.to(room.code).emit("voice:clip", {
      fromUserId: userId,
      data: payload.data,
      mimeType: typeof payload.mimeType === "string" ? payload.mimeType : "audio/m4a",
    });
  });

  socket.on("disconnect", () => {
    const room = getRoomForUser(userId);
    if (!room) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player || player.socketId !== socket.id) return; // stale/secondary connection

    dequeue(userId);
    const updated = markDisconnected(userId);
    if (updated) broadcastRoomUpdate(io, updated);

    const timer = setTimeout(() => {
      disconnectTimers.delete(userId);
      const r = getRoomForUser(userId);
      if (!r) return;
      const p = r.players.find((pl) => pl.userId === userId);
      if (p && !p.connected) {
        if (r.status === "lobby") {
          const after = leaveRoom(userId);
          if (after) broadcastRoomUpdate(io, after);
        } else {
          // Keep them in final standings but out of remaining turn/buzz eligibility.
          p.outOfRound1 = true;
          io.to(r.code).emit("game:playerLeft", { userId, room: serializeRoom(r) });
        }
      }
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(userId, timer);
  });

  // On (re)connection, silently rejoin an in-progress room if one exists for this user.
  const existingRoom = getRoomForUser(userId);
  if (existingRoom) {
    const player = existingRoom.players.find((p) => p.userId === userId);
    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      player.disconnectedAt = null;
      socket.join(existingRoom.code);
      cancelDisconnectGrace(userId);
      broadcastRoomUpdate(io, existingRoom);
      socket.emit("game:state", buildStateSnapshot(existingRoom));
    }
  }
}

function cancelDisconnectGrace(userId: string) {
  const timer = disconnectTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(userId);
  }
}
