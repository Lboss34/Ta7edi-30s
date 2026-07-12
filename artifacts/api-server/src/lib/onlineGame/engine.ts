import type { Server } from "socket.io";
import type { Db } from "mongodb";
import { isAnswerCorrect } from "./textMatch";
import { serializeRoom } from "./rooms";
import type {
  Room,
  RoomQuestions,
  OnlinePlayer,
  PingPongQuestion,
  AuctionTopic,
  BuzzerQuestion,
  RapidQuestion,
  TransferPuzzle,
} from "./types";

const LIMITS = { round1: 6, round2: 3, round3: 8, round4: 8, round5: 4 };
const ROUND1_TIME_MS = 6_000;       // Master Plan: "6 seconds to type"
const ROUND2_BID_TIME_MS = 6_000;   // Master Plan: "6s to bid"
const ROUND2_ANSWER_TIME_MS = 15_000;
const ROUND3_BUZZ_WINDOW_MS = 20_000;
const ROUND3_ANSWER_TIME_MS = 10_000;
const ROUND4_TIME_MS = 10_000;
const ROUND4_REVEAL_MS = 3_000;
const ROUND5_BUZZ_WINDOW_MS = 25_000;
const ROUND5_ANSWER_TIME_MS = 12_000;
const TIEBREAKER_BUZZ_WINDOW_MS = 30_000;
const TIEBREAKER_ANSWER_TIME_MS = 12_000;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function connectedActive(room: Room): OnlinePlayer[] {
  return room.players.filter((p) => p.connected);
}

function clearTimer(room: Room) {
  if (room.activeTimer) {
    clearTimeout(room.activeTimer);
    room.activeTimer = null;
  }
}

function schedule(room: Room, ms: number, fn: () => void) {
  clearTimer(room);
  room.activeTimer = setTimeout(fn, ms);
}

function emitRoom(io: Server, room: Room, event: string, payload: unknown) {
  io.to(room.code).emit(event, payload);
}

function emitToPlayer(io: Server, room: Room, userId: string, event: string, payload: unknown) {
  const player = room.players.find((p) => p.userId === userId);
  if (player?.socketId) io.to(player.socketId).emit(event, payload);
}

function broadcastRoomState(io: Server, room: Room) {
  emitRoom(io, room, "room:update", { room: serializeRoom(room) });
}

async function loadQuestions(db: Db, difficulty: string): Promise<RoomQuestions> {
  const filter = { difficulty };
  const [round1, round2, round3, round4, round5, tiebreaker] = await Promise.all([
    db.collection("round1_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round1 } }]).toArray(),
    db.collection("round2_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round2 } }]).toArray(),
    db.collection("round3_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round3 } }]).toArray(),
    db.collection("round4_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round4 } }]).toArray(),
    db.collection("round5_questions").aggregate([{ $match: filter }, { $sample: { size: LIMITS.round5 } }]).toArray(),
    db.collection("tiebreaker_questions").aggregate([{ $match: { difficulty: { $in: ["medium", "hard"] } } }, { $sample: { size: 10 } }]).toArray(),
  ]);
  return {
    round1: round1 as unknown as PingPongQuestion[],
    round2: round2 as unknown as AuctionTopic[],
    round3: round3 as unknown as BuzzerQuestion[],
    round4: round4 as unknown as RapidQuestion[],
    round5: round5 as unknown as TransferPuzzle[],
    tiebreaker: tiebreaker as unknown as TransferPuzzle[],
  };
}

export async function startGame(io: Server, db: Db, room: Room): Promise<void> {
  room.questions = await loadQuestions(db, room.difficulty);
  room.status = "playing";
  room.players.forEach((p) => {
    p.score = 0;
    p.strikes = 0;
    p.outOfRound1 = false;
  });
  emitRoom(io, room, "game:started", { room: serializeRoom(room) });
  setupRound1(io, room);
}

// ─────────────────────────── Round 1: PingPong (turn-based) ───────────────────────────

function setupRound1(io: Server, room: Room) {
  const questions = room.questions!.round1;
  room.currentRound = "round1";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round1, questions.length);
  room.turnOrder = shuffle(room.players.map((p) => p.userId));
  room.turnIndex = 0;

  if (room.maxQuestionsThisRound === 0 || room.turnOrder.length === 0) {
    setupRound2(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round1");
  askRound1Question(io, room);
}

function nextEligibleTurnIndex(room: Room, fromIndex: number): number {
  const n = room.turnOrder.length;
  for (let step = 1; step <= n; step++) {
    const idx = (fromIndex + step) % n;
    const userId = room.turnOrder[idx]!;
    const player = room.players.find((p) => p.userId === userId);
    if (player && !player.outOfRound1) return idx;
  }
  return -1;
}

function askRound1Question(io: Server, room: Room) {
  const anyoneLeft = room.turnOrder.some((uid) => !room.players.find((p) => p.userId === uid)?.outOfRound1);
  if (room.questionIndex >= room.maxQuestionsThisRound || !anyoneLeft) {
    setupRound2(io, room);
    return;
  }

  const currentPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!currentPlayer || currentPlayer.outOfRound1) {
    const nextIdx = nextEligibleTurnIndex(room, room.turnIndex);
    if (nextIdx === -1) {
      setupRound2(io, room);
      return;
    }
    room.turnIndex = nextIdx;
  }

  room.phase = "round1_turn";
  const question = room.questions!.round1[room.questionIndex]!;
  room.questionDeadline = Date.now() + ROUND1_TIME_MS;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex])!;

  emitRoom(io, room, "game:question", {
    round: "round1",
    phase: room.phase,
    turnUserId: turnPlayer.userId,
    question: { id: question.id, question: question.question },
    deadlineTs: room.questionDeadline,
    scores: scoreMap(room),
  });

  schedule(room, ROUND1_TIME_MS, () => resolveRound1(io, room, turnPlayer.userId, null));
}

function resolveRound1(io: Server, room: Room, userId: string, submittedText: string | null) {
  if (room.phase !== "round1_turn") return;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!turnPlayer || turnPlayer.userId !== userId) return;

  const question = room.questions!.round1[room.questionIndex]!;
  const correct = submittedText !== null && isAnswerCorrect(submittedText, question.validAnswers);

  if (correct) {
    turnPlayer.score += 1;
  } else {
    turnPlayer.strikes += 1;
    if (turnPlayer.strikes >= 3) turnPlayer.outOfRound1 = true;
  }

  emitRoom(io, room, "game:answerResult", {
    round: "round1",
    userId: turnPlayer.userId,
    submittedText,
    correct,
    correctAnswer: question.validAnswers[0] ?? "",
    scores: scoreMap(room),
    strikes: turnPlayer.strikes,
    outOfRound1: turnPlayer.outOfRound1,
  });

  room.questionIndex += 1;
  const nextIdx = nextEligibleTurnIndex(room, room.turnIndex);
  if (nextIdx !== -1) room.turnIndex = nextIdx;

  setTimeout(() => askRound1Question(io, room), 1500);
}

// ─────────────────────────── Round 2: Auction ───────────────────────────

function setupRound2(io: Server, room: Room) {
  const topics = room.questions!.round2;
  room.currentRound = "round2";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round2, topics.length);
  if (room.maxQuestionsThisRound === 0) {
    setupRound3(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round2");
  askRound2Topic(io, room);
}

function askRound2Topic(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    setupRound3(io, room);
    return;
  }
  const topic = room.questions!.round2[room.questionIndex]!;
  room.phase = "round2_bidding";
  room.currentBid = null;
  room.auctionWinnerUserId = null;
  room.biddingDeadline = Date.now() + ROUND2_BID_TIME_MS;

  emitRoom(io, room, "game:question", {
    round: "round2",
    phase: room.phase,
    question: { id: topic.id, category: topic.category, description: topic.description },
    deadlineTs: room.biddingDeadline,
    scores: scoreMap(room),
  });

  schedule(room, ROUND2_BID_TIME_MS, () => closeBidding(io, room));
}

export function placeBid(room: Room, io: Server, userId: string, amount: number) {
  if (room.phase !== "round2_bidding") return;
  const player = room.players.find((p) => p.userId === userId && p.connected);
  if (!player) return;
  if (!Number.isFinite(amount) || amount < 1 || amount > Math.max(player.score, 10)) return;
  if (room.currentBid && amount <= room.currentBid.amount) return;

  room.currentBid = { userId, amount };
  room.biddingDeadline = Date.now() + ROUND2_BID_TIME_MS;
  emitRoom(io, room, "game:bidUpdate", { userId, amount, deadlineTs: room.biddingDeadline });
  schedule(room, ROUND2_BID_TIME_MS, () => closeBidding(io, room));
}

function closeBidding(io: Server, room: Room) {
  if (room.phase !== "round2_bidding") return;
  if (!room.currentBid) {
    emitRoom(io, room, "game:auctionResult", { round: "round2", winnerUserId: null, amount: 0 });
    room.questionIndex += 1;
    setTimeout(() => askRound2Topic(io, room), 1500);
    return;
  }

  room.auctionWinnerUserId = room.currentBid.userId;
  room.phase = "round2_answer";
  room.questionDeadline = Date.now() + ROUND2_ANSWER_TIME_MS;
  emitRoom(io, room, "game:auctionWon", {
    winnerUserId: room.auctionWinnerUserId,
    amount: room.currentBid.amount,
    deadlineTs: room.questionDeadline,
  });
  schedule(room, ROUND2_ANSWER_TIME_MS, () => resolveRound2Answer(io, room, room.auctionWinnerUserId!, null));
}

function resolveRound2Answer(io: Server, room: Room, userId: string, submittedText: string | null) {
  if (room.phase !== "round2_answer" || room.auctionWinnerUserId !== userId) return;
  const topic = room.questions!.round2[room.questionIndex]!;
  const player = room.players.find((p) => p.userId === userId)!;
  const bidAmount = room.currentBid?.amount ?? 0;
  const correct = submittedText !== null && isAnswerCorrect(submittedText, topic.possibleAnswers);

  player.score = correct ? player.score + bidAmount : Math.max(0, player.score - bidAmount);

  emitRoom(io, room, "game:answerResult", {
    round: "round2",
    userId,
    submittedText,
    correct,
    correctAnswer: topic.possibleAnswers[0] ?? "",
    scores: scoreMap(room),
  });

  room.questionIndex += 1;
  setTimeout(() => askRound2Topic(io, room), 1500);
}

// ─────────────────────────── Generic buzzer round (Round 3 / Round 5 / Tiebreaker) ───────────────────────────

interface BuzzerRoundConfig {
  roundKey: "round3" | "round5" | "tiebreaker";
  buzzPhase: "round3_buzz" | "round5_buzz" | "tiebreaker_buzz";
  answerPhase: "round3_answer" | "round5_answer" | "tiebreaker_answer";
  buzzWindowMs: number;
  answerTimeMs: number;
  pointValue: number;
  getQuestionPublic: (q: BuzzerQuestion | TransferPuzzle) => Record<string, unknown>;
  getValidAnswers: (q: BuzzerQuestion | TransferPuzzle) => string[];
  eligibleUserIds: (room: Room) => string[];
  onQuestionResolved: (io: Server, room: Room, winnerUserId: string | null, correct: boolean) => void;
}

function askBuzzerQuestion(io: Server, room: Room, question: BuzzerQuestion | TransferPuzzle, cfg: BuzzerRoundConfig) {
  room.phase = cfg.buzzPhase;
  room.buzzLock = null;
  room.excludedFromBuzz = new Set();
  room.questionDeadline = Date.now() + cfg.buzzWindowMs;

  emitRoom(io, room, "game:question", {
    round: cfg.roundKey,
    phase: room.phase,
    question: cfg.getQuestionPublic(question),
    deadlineTs: room.questionDeadline,
    scores: scoreMap(room),
  });

  schedule(room, cfg.buzzWindowMs, () => {
    if (room.phase === cfg.buzzPhase) {
      revealBuzzerAnswer(io, room, question, cfg, null, false);
    }
  });
}

export function buzz(room: Room, io: Server, userId: string, cfg: BuzzerRoundConfig) {
  if (room.phase !== cfg.buzzPhase) return;
  if (room.buzzLock) return; // someone already locked
  if (room.excludedFromBuzz.has(userId)) return;
  if (!cfg.eligibleUserIds(room).includes(userId)) return;
  const player = room.players.find((p) => p.userId === userId && p.connected);
  if (!player) return;

  room.buzzLock = { userId, lockedAt: Date.now(), answerDeadline: Date.now() + cfg.answerTimeMs };
  room.phase = cfg.answerPhase;
  emitRoom(io, room, "game:buzzResult", { winnerUserId: userId, deadlineTs: room.buzzLock.answerDeadline });

  const question = currentBuzzerQuestion(room, cfg);
  schedule(room, cfg.answerTimeMs, () => resolveBuzzerAnswer(io, room, userId, null, question!, cfg));
}

function currentBuzzerQuestion(room: Room, cfg: BuzzerRoundConfig): BuzzerQuestion | TransferPuzzle | undefined {
  if (cfg.roundKey === "round3") return room.questions!.round3[room.questionIndex];
  if (cfg.roundKey === "round5") return room.questions!.round5[room.questionIndex];
  return room.tiebreakerPool[room.tiebreakerIndex];
}

export function resolveBuzzerAnswer(
  io: Server,
  room: Room,
  userId: string,
  submittedText: string | null,
  question: BuzzerQuestion | TransferPuzzle,
  cfg: BuzzerRoundConfig,
) {
  if (room.phase !== cfg.answerPhase || room.buzzLock?.userId !== userId) return;
  const correct = submittedText !== null && isAnswerCorrect(submittedText, cfg.getValidAnswers(question));

  if (correct) {
    const player = room.players.find((p) => p.userId === userId)!;
    player.score += cfg.pointValue;
    emitRoom(io, room, "game:answerResult", {
      round: cfg.roundKey,
      userId,
      submittedText,
      correct: true,
      correctAnswer: cfg.getValidAnswers(question)[0] ?? "",
      scores: scoreMap(room),
    });
    revealBuzzerAnswer(io, room, question, cfg, userId, true);
    return;
  }

  emitRoom(io, room, "game:answerResult", {
    round: cfg.roundKey,
    userId,
    submittedText,
    correct: false,
    scores: scoreMap(room),
  });

  room.excludedFromBuzz.add(userId);
  room.buzzLock = null;
  const remaining = cfg.eligibleUserIds(room).filter((uid) => !room.excludedFromBuzz.has(uid));
  if (remaining.length === 0) {
    revealBuzzerAnswer(io, room, question, cfg, null, false);
    return;
  }
  room.phase = cfg.buzzPhase;
  schedule(room, Math.max(1000, room.questionDeadline! - Date.now()), () => {
    if (room.phase === cfg.buzzPhase) revealBuzzerAnswer(io, room, question, cfg, null, false);
  });
}

function revealBuzzerAnswer(
  io: Server,
  room: Room,
  question: BuzzerQuestion | TransferPuzzle,
  cfg: BuzzerRoundConfig,
  winnerUserId: string | null,
  correct: boolean,
) {
  emitRoom(io, room, "game:questionReveal", {
    round: cfg.roundKey,
    correctAnswer: cfg.getValidAnswers(question)[0] ?? "",
  });
  cfg.onQuestionResolved(io, room, winnerUserId, correct);
}

function round3Config(): BuzzerRoundConfig {
  return {
    roundKey: "round3",
    buzzPhase: "round3_buzz",
    answerPhase: "round3_answer",
    buzzWindowMs: ROUND3_BUZZ_WINDOW_MS,
    answerTimeMs: ROUND3_ANSWER_TIME_MS,
    pointValue: 2,
    getQuestionPublic: (q) => ({ id: q.id, question: (q as BuzzerQuestion).question, choices: (q as BuzzerQuestion).choices }),
    getValidAnswers: (q) => [(q as BuzzerQuestion).answer],
    eligibleUserIds: (room) => connectedActive(room).map((p) => p.userId),
    onQuestionResolved: (io, room) => {
      room.questionIndex += 1;
      setTimeout(() => askRound3Question(io, room), 1500);
    },
  };
}

function setupRound3(io: Server, room: Room) {
  const questions = room.questions!.round3;
  room.currentRound = "round3";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round3, questions.length);
  if (room.maxQuestionsThisRound === 0) {
    setupRound4(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round3");
  askRound3Question(io, room);
}

function askRound3Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    setupRound4(io, room);
    return;
  }
  const question = room.questions!.round3[room.questionIndex]!;
  askBuzzerQuestion(io, room, question, round3Config());
}

// ─────────────────────────── Round 4: Rapid Fire (simultaneous) ───────────────────────────

function setupRound4(io: Server, room: Room) {
  const questions = room.questions!.round4;
  room.currentRound = "round4";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round4, questions.length);
  if (room.maxQuestionsThisRound === 0) {
    setupRound5(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round4");
  askRound4Question(io, room);
}

function askRound4Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    setupRound5(io, room);
    return;
  }
  const question = room.questions!.round4[room.questionIndex]!;
  room.phase = "round4_question";
  room.simultaneousAnswers = new Map();
  room.questionDeadline = Date.now() + ROUND4_TIME_MS;

  emitRoom(io, room, "game:question", {
    round: "round4",
    phase: room.phase,
    question: { id: question.id, question: question.question },
    deadlineTs: room.questionDeadline,
    scores: scoreMap(room),
  });

  schedule(room, ROUND4_TIME_MS, () => revealRound4(io, room));
}

export function submitRound4Answer(room: Room, io: Server, userId: string, text: string) {
  if (room.phase !== "round4_question") return;
  if (room.simultaneousAnswers.has(userId)) return;
  const player = room.players.find((p) => p.userId === userId && p.connected);
  if (!player) return;

  const question = room.questions!.round4[room.questionIndex]!;
  const correct = isAnswerCorrect(text, [question.answer]);
  room.simultaneousAnswers.set(userId, { userId, text, correct, submittedAt: Date.now() });
  emitToPlayer(io, room, userId, "game:answerAck", { correct: null }); // ack receipt only, correctness revealed together

  const eligible = connectedActive(room);
  if (eligible.every((p) => room.simultaneousAnswers.has(p.userId))) {
    revealRound4(io, room);
  }
}

function revealRound4(io: Server, room: Room) {
  if (room.phase !== "round4_question") return;
  const question = room.questions!.round4[room.questionIndex]!;
  const windowStart = room.questionDeadline! - ROUND4_TIME_MS;
  const results: { userId: string; text: string; correct: boolean; points: number }[] = [];

  for (const [userId, ans] of room.simultaneousAnswers.entries()) {
    const player = room.players.find((p) => p.userId === userId);
    if (!player) continue;
    let points = 0;
    if (ans.correct) {
      points = ans.submittedAt - windowStart <= ROUND4_TIME_MS / 2 ? 2 : 1;
      player.score += points;
    }
    results.push({ userId, text: ans.text, correct: ans.correct, points });
  }

  room.phase = "round4_reveal";
  emitRoom(io, room, "game:round4Reveal", {
    correctAnswer: question.answer,
    results,
    scores: scoreMap(room),
  });

  room.questionIndex += 1;
  setTimeout(() => askRound4Question(io, room), ROUND4_REVEAL_MS);
}

// ─────────────────────────── Round 5: Transfer Puzzle (buzzer race) ───────────────────────────

function round5Config(): BuzzerRoundConfig {
  return {
    roundKey: "round5",
    buzzPhase: "round5_buzz",
    answerPhase: "round5_answer",
    buzzWindowMs: ROUND5_BUZZ_WINDOW_MS,
    answerTimeMs: ROUND5_ANSWER_TIME_MS,
    pointValue: 3,
    getQuestionPublic: (q) => ({ id: q.id, transfers: (q as TransferPuzzle).transfers }),
    getValidAnswers: (q) => [(q as TransferPuzzle).answer],
    eligibleUserIds: (room) => connectedActive(room).map((p) => p.userId),
    onQuestionResolved: (io, room) => {
      room.questionIndex += 1;
      setTimeout(() => askRound5Question(io, room), 1500);
    },
  };
}

function setupRound5(io: Server, room: Room) {
  const puzzles = room.questions!.round5;
  room.currentRound = "round5";
  room.questionIndex = 0;
  room.maxQuestionsThisRound = Math.min(LIMITS.round5, puzzles.length);
  if (room.maxQuestionsThisRound === 0) {
    finishGame(io, room);
    return;
  }
  broadcastRoundStart(io, room, "round5");
  askRound5Question(io, room);
}

function askRound5Question(io: Server, room: Room) {
  if (room.questionIndex >= room.maxQuestionsThisRound) {
    finishGame(io, room);
    return;
  }
  const puzzle = room.questions!.round5[room.questionIndex]!;
  askBuzzerQuestion(io, room, puzzle, round5Config());
}

// ─────────────────────────── Game end + Tiebreaker (sudden death) ───────────────────────────

function scoreMap(room: Room): Record<string, number> {
  return Object.fromEntries(room.players.map((p) => [p.userId, p.score]));
}

function finishGame(io: Server, room: Room) {
  const maxScore = Math.max(...room.players.map((p) => p.score));
  const tied = room.players.filter((p) => p.score === maxScore);

  if (tied.length <= 1 || room.questions!.tiebreaker.length === 0) {
    room.status = "finished";
    room.currentRound = null;
    room.phase = "game_over";
    emitRoom(io, room, "game:over", {
      scores: scoreMap(room),
      winnerUserId: tied[0]?.userId ?? null,
      tied: tied.length > 1 ? tied.map((p) => p.userId) : [],
    });
    return;
  }

  room.currentRound = "tiebreaker";
  room.tiebreakerPool = room.questions!.tiebreaker;
  room.tiebreakerIndex = 0;
  room.tiebreakerCandidates = tied.map((p) => p.userId);
  broadcastRoundStart(io, room, "tiebreaker");
  askTiebreakerQuestion(io, room);
}

function tiebreakerConfig(): BuzzerRoundConfig {
  return {
    roundKey: "tiebreaker",
    buzzPhase: "tiebreaker_buzz",
    answerPhase: "tiebreaker_answer",
    buzzWindowMs: TIEBREAKER_BUZZ_WINDOW_MS,
    answerTimeMs: TIEBREAKER_ANSWER_TIME_MS,
    pointValue: 0,
    getQuestionPublic: (q) => ({ id: q.id, transfers: (q as TransferPuzzle).transfers }),
    getValidAnswers: (q) => [(q as TransferPuzzle).answer],
    eligibleUserIds: (room) => room.tiebreakerCandidates,
    onQuestionResolved: (io, room, winnerUserId, correct) => {
      if (correct && winnerUserId) {
        room.status = "finished";
        room.phase = "game_over";
        emitRoom(io, room, "game:over", {
          scores: scoreMap(room),
          winnerUserId,
          tied: [],
          decidedByTiebreaker: true,
        });
        return;
      }
      room.tiebreakerIndex += 1;
      if (room.tiebreakerIndex >= room.tiebreakerPool.length) {
        room.status = "finished";
        room.phase = "game_over";
        emitRoom(io, room, "game:over", {
          scores: scoreMap(room),
          winnerUserId: null,
          tied: room.tiebreakerCandidates,
          decidedByTiebreaker: false,
        });
        return;
      }
      setTimeout(() => askTiebreakerQuestion(io, room), 1500);
    },
  };
}

function askTiebreakerQuestion(io: Server, room: Room) {
  const puzzle = room.tiebreakerPool[room.tiebreakerIndex]!;
  askBuzzerQuestion(io, room, puzzle, tiebreakerConfig());
}

// ─────────────────────────── Shared dispatch entry points (called from socket handlers) ───────────────────────────

function broadcastRoundStart(io: Server, room: Room, round: string) {
  emitRoom(io, room, "game:roundStart", { round, scores: scoreMap(room) });
}

export function handleSubmitAnswer(io: Server, room: Room, userId: string, text: string) {
  switch (room.currentRound) {
    case "round1":
      resolveRound1(io, room, userId, text);
      return;
    case "round2":
      resolveRound2Answer(io, room, userId, text);
      return;
    case "round3": {
      const q = room.questions!.round3[room.questionIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, round3Config());
      return;
    }
    case "round4":
      submitRound4Answer(room, io, userId, text);
      return;
    case "round5": {
      const q = room.questions!.round5[room.questionIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, round5Config());
      return;
    }
    case "tiebreaker": {
      const q = room.tiebreakerPool[room.tiebreakerIndex];
      if (q) resolveBuzzerAnswer(io, room, userId, text, q, tiebreakerConfig());
      return;
    }
  }
}

export function handleBuzz(io: Server, room: Room, userId: string) {
  if (room.currentRound === "round3") buzz(room, io, userId, round3Config());
  else if (room.currentRound === "round5") buzz(room, io, userId, round5Config());
  else if (room.currentRound === "tiebreaker") buzz(room, io, userId, tiebreakerConfig());
}

export function handleSkip(io: Server, room: Room, userId: string) {
  if (room.phase !== "round1_turn") return;
  const turnPlayer = room.players.find((p) => p.userId === room.turnOrder[room.turnIndex]);
  if (!turnPlayer || turnPlayer.userId !== userId || turnPlayer.skipUsed) return;
  turnPlayer.skipUsed = true;
  emitRoom(io, room, "game:answerResult", {
    round: "round1",
    userId,
    submittedText: null,
    correct: false,
    skipped: true,
    scores: scoreMap(room),
  });
  room.questionIndex += 1;
  const nextIdx = nextEligibleTurnIndex(room, room.turnIndex);
  if (nextIdx !== -1) room.turnIndex = nextIdx;
  setTimeout(() => askRound1Question(io, room), 1000);
}

/** Full state snapshot for a reconnecting client — best-effort current question replay. */
export function buildStateSnapshot(room: Room) {
  return {
    room: serializeRoom(room),
    questionDeadline: room.questionDeadline,
    buzzLock: room.buzzLock ? { userId: room.buzzLock.userId } : null,
    auctionWinnerUserId: room.auctionWinnerUserId,
    currentBid: room.currentBid,
  };
}
