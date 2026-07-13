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

async function fetchProfile(userId: string): Promise<{
  username: string;
  avatar: string;
  level: number;
  totalWins: number;
} | null> {
  const db = await getDb();
  const { ObjectId } = await import("mongodb");
  const user = await db.collection("users").findOne({ _id: new ObjectId(userId) });
  if (!user) return null;
  return {
    username:  user["username"]  as string,
    avatar:    user["avatar"]    as string,
    level:     (user["level"]     as number) ?? 1,
    totalWins: (user["totalWins"] as number) ?? 0,
  };
}

function broadcastRoomUpdate(io: Server, room: Room) {
  io.to(room.code).emit("room:update", { room: serializeRoom(room) });
}

function cancelDisconnectGrace(userId: string) {
  const timer = disconnectTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(userId);
  }
}

export function registerOnlineGameHandlers(io: Server, socket: Socket) {
  const userId = socket.data["userId"] as string;

  // ── Room: Create ────────────────────────────────────────────────────────────
  socket.on("room:create", async (payload: { difficulty?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const difficulty = isDifficulty(payload?.difficulty) ? payload.difficulty : "medium";
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const existingRoom = getRoomForUser(userId);
      if (existingRoom) leaveRoom(userId);

      const room = createRoom({
        mode:         "group",
        difficulty,
        hostUserId:   userId,
        hostUsername: profile.username,
        hostAvatar:   profile.avatar,
        hostSocketId: socket.id,
        hostLevel:    profile.level,
        hostTotalWins:profile.totalWins,
      });
      socket.join(room.code);
      ack?.({ ok: true, room: serializeRoom(room) });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل إنشاء الغرفة" });
    }
  });

  // ── Room: Join ──────────────────────────────────────────────────────────────
  socket.on("room:join", async (payload: { code?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const code = String(payload?.code ?? "").toUpperCase().trim();
      if (!code) throw new RoomError("الرجاء إدخال رمز الغرفة");
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const room = joinRoom(code, userId, profile.username, profile.avatar, socket.id, profile.level, profile.totalWins);
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

  // ── Room: Leave ─────────────────────────────────────────────────────────────
  socket.on("room:leave", () => {
    const room = getRoomForUser(userId);
    dequeue(userId);
    const updated = leaveRoom(userId);
    socket.leave(room?.code ?? "");
    if (updated) broadcastRoomUpdate(io, updated);
  });

  // ── Room: Start ─────────────────────────────────────────────────────────────
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

  // ── Matchmaking: Join ───────────────────────────────────────────────────────
  socket.on("matchmaking:join", async (payload: { difficulty?: unknown }, ack?: (res: unknown) => void) => {
    try {
      const difficulty = isDifficulty(payload?.difficulty) ? payload.difficulty : "medium";
      const profile = await fetchProfile(userId);
      if (!profile) throw new RoomError("الملف الشخصي غير موجود");

      const existingRoom = getRoomForUser(userId);
      if (existingRoom) leaveRoom(userId);

      const opponent = enqueue({
        userId,
        username:  profile.username,
        avatar:    profile.avatar,
        socketId:  socket.id,
        difficulty,
        queuedAt:  Date.now(),
        level:     profile.level,
        totalWins: profile.totalWins,
      });

      if (!opponent) {
        ack?.({ ok: true, matched: false });
        return;
      }

      // Matched — create a quick room
      const oppProfile = await fetchProfile(opponent.userId);
      const room = createRoom({
        mode:          "quick",
        difficulty,
        hostUserId:    userId,
        hostUsername:  profile.username,
        hostAvatar:    profile.avatar,
        hostSocketId:  socket.id,
        hostLevel:     profile.level,
        hostTotalWins: profile.totalWins,
      });
      joinRoom(
        room.code,
        opponent.userId,
        opponent.username,
        opponent.avatar,
        opponent.socketId,
        opponent.level ?? 1,
        opponent.totalWins ?? 0,
      );

      // Join both sockets to the room channel
      socket.join(room.code);
      const oppSocket = io.sockets.sockets.get(opponent.socketId);
      if (oppSocket) oppSocket.join(room.code);

      // Notify both players
      io.to(room.code).emit("room:matched", { room: serializeRoom(room) });
      ack?.({ ok: true, matched: true, room: serializeRoom(room) });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof RoomError ? err.message : "فشل البحث" });
    }
  });

  // ── Matchmaking: Cancel ─────────────────────────────────────────────────────
  socket.on("matchmaking:cancel", () => {
    dequeue(userId);
    const room = getRoomForUser(userId);
    if (room) {
      const updated = leaveRoom(userId);
      socket.leave(room.code);
      if (updated) broadcastRoomUpdate(io, updated);
    }
  });

  // ── Player Ready (quick match ready system) ─────────────────────────────────
  socket.on("player:ready", async () => {
    const room = getRoomForUser(userId);
    if (!room || room.status !== "lobby") return;

    room.readySet.add(userId);
    const readyUserIds = Array.from(room.readySet);
    io.to(room.code).emit("room:readyUpdate", { readyUserIds });

    // When ALL connected players are ready → 3-second countdown then auto-start
    const connected = room.players.filter((p) => p.connected);
    if (connected.length >= 2 && connected.every((p) => room.readySet.has(p.userId))) {
      // Emit countdown for client-side display
      io.to(room.code).emit("room:readyCountdown", { seconds: 3 });
      setTimeout(async () => {
        // Double check still in lobby
        if (room.status !== "lobby") return;
        try {
          const db = await getDb();
          await startGame(io, db, room);
        } catch (err) {
          logger.warn({ err }, "Auto-start after ready failed");
        }
      }, 3000);
    }
  });

  // ── Game: Submit Answer ─────────────────────────────────────────────────────
  socket.on("game:submitAnswer", (payload: { text?: unknown }) => {
    const room = getRoomForUser(userId);
    if (!room || room.status !== "playing") return;
    const text = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!text) return;
    handleSubmitAnswer(io, room, userId, text);
  });

  // ── Game: Buzz ──────────────────────────────────────────────────────────────
  socket.on("game:buzz", () => {
    const room = getRoomForUser(userId);
    if (!room || room.status !== "playing") return;
    handleBuzz(io, room, userId);
  });

  // ── Game: Skip (Round 1) ────────────────────────────────────────────────────
  socket.on("game:skip", () => {
    const room = getRoomForUser(userId);
    if (!room || room.status !== "playing") return;
    handleSkip(io, room, userId);
  });

  // ── Game: Bid (Round 2) ─────────────────────────────────────────────────────
  socket.on("game:bid", (payload: { amount?: unknown }) => {
    const room = getRoomForUser(userId);
    if (!room || room.status !== "playing") return;
    const amount = typeof payload?.amount === "number" ? payload.amount : 0;
    placeBid(room, io, userId, amount);
  });

  // ── Voice relay ─────────────────────────────────────────────────────────────
  socket.on("voice:clip", (payload: { data: unknown; mimeType: string }) => {
    const room = getRoomForUser(userId);
    if (!room) return;
    io.to(room.code).emit("voice:clip", { fromUserId: userId, ...payload });
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const room = getRoomForUser(userId);
    if (!room) return;
    const player = room.players.find((p) => p.userId === userId);
    if (!player || player.socketId !== socket.id) return;

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
          p.outOfRound1 = true;
          io.to(r.code).emit("game:playerLeft", { userId, room: serializeRoom(r) });
        }
      }
    }, DISCONNECT_GRACE_MS);
    disconnectTimers.set(userId, timer);
  });

  // ── Reconnect: silently rejoin in-progress room ──────────────────────────────
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
