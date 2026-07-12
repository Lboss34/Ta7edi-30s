import type { Db } from "mongodb";
import type { Difficulty, OnlinePlayer, Room, RoomQuestions } from "./types";

const rooms = new Map<string, Room>();
// userId -> room code, so we can find a player's active room on reconnect.
const userRoom = new Map<string, string>();

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I to avoid confusion

function generateRoomCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function createRoomCode(): string {
  let code = generateRoomCode();
  while (rooms.has(code)) code = generateRoomCode();
  return code;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function getRoomForUser(userId: string): Room | undefined {
  const code = userRoom.get(userId);
  return code ? rooms.get(code) : undefined;
}

function makePlayer(userId: string, username: string, avatar: string, socketId: string, isHost: boolean): OnlinePlayer {
  return {
    userId,
    username,
    avatar,
    socketId,
    connected: true,
    score: 0,
    strikes: 0,
    skipUsed: false,
    outOfRound1: false,
    disconnectedAt: null,
    isHost,
  };
}

export function createRoom(params: {
  mode: "group" | "quick";
  difficulty: Difficulty;
  hostUserId: string;
  hostUsername: string;
  hostAvatar: string;
  hostSocketId: string;
}): Room {
  const code = createRoomCode();
  const room: Room = {
    code,
    mode: params.mode,
    difficulty: params.difficulty,
    status: "lobby",
    players: [makePlayer(params.hostUserId, params.hostUsername, params.hostAvatar, params.hostSocketId, true)],
    questions: null,
    currentRound: null,
    phase: "lobby",
    questionIndex: 0,
    maxQuestionsThisRound: 0,
    turnOrder: [],
    turnIndex: 0,
    currentBid: null,
    biddingDeadline: null,
    auctionWinnerUserId: null,
    buzzLock: null,
    excludedFromBuzz: new Set(),
    simultaneousAnswers: new Map(),
    questionDeadline: null,
    activeTimer: null,
    tiebreakerPool: [],
    tiebreakerIndex: 0,
    tiebreakerCandidates: [],
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  userRoom.set(params.hostUserId, code);
  return room;
}

export class RoomError extends Error {}

export function joinRoom(code: string, userId: string, username: string, avatar: string, socketId: string): Room {
  const room = rooms.get(code);
  if (!room) throw new RoomError("الغرفة غير موجودة");
  if (room.status === "finished") throw new RoomError("انتهت هذه الجولة");

  const existing = room.players.find((p) => p.userId === userId);
  if (existing) {
    existing.socketId = socketId;
    existing.connected = true;
    existing.disconnectedAt = null;
  } else {
    if (room.status !== "lobby") throw new RoomError("اللعبة قيد التشغيل بالفعل");
    if (room.players.length >= 8) throw new RoomError("الغرفة ممتلئة");
    room.players.push(makePlayer(userId, username, avatar, socketId, false));
  }
  userRoom.set(userId, code);
  room.lastActivityAt = Date.now();
  return room;
}

export function leaveRoom(userId: string): Room | undefined {
  const code = userRoom.get(userId);
  if (!code) return undefined;
  const room = rooms.get(code);
  userRoom.delete(userId);
  if (!room) return undefined;

  room.players = room.players.filter((p) => p.userId !== userId);
  room.lastActivityAt = Date.now();

  if (room.players.length === 0) {
    if (room.activeTimer) clearTimeout(room.activeTimer);
    rooms.delete(code);
    return undefined;
  }
  // Reassign host if the host left.
  if (!room.players.some((p) => p.isHost)) {
    room.players[0]!.isHost = true;
  }
  return room;
}

export function markDisconnected(userId: string): Room | undefined {
  const code = userRoom.get(userId);
  if (!code) return undefined;
  const room = rooms.get(code);
  if (!room) return undefined;
  const player = room.players.find((p) => p.userId === userId);
  if (player) {
    player.connected = false;
    player.disconnectedAt = Date.now();
  }
  return room;
}

export function attachQuestions(room: Room, questions: RoomQuestions): void {
  room.questions = questions;
}

/** Public snapshot sent to clients — omits server-only fields like the correct answer. */
export function serializeRoom(room: Room) {
  return {
    code: room.code,
    mode: room.mode,
    difficulty: room.difficulty,
    status: room.status,
    players: room.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      connected: p.connected,
      score: p.score,
      strikes: p.strikes,
      outOfRound1: p.outOfRound1,
      isHost: p.isHost,
    })),
    currentRound: room.currentRound,
    phase: room.phase,
  };
}

export function allRooms(): Room[] {
  return Array.from(rooms.values());
}
